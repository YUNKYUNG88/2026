import {
  parseSSE,
  anthropicTextDelta,
  googleTextDelta,
  toEventStream,
  friendlyErrorMessage,
  withStreamFallback,
  type StreamChunk,
} from './stream';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Provider = 'anthropic' | 'google';

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

// 프로바이더 연결을 열고 텍스트 조각을 흘려보내는 스트림을 반환한다.
// Anthropic은 연결 단계 실패(4xx/5xx)가 응답 전에 throw 되므로 HTTP 상태 코드로 매핑된다.
// Google은 streamGoogle이 지연 실행되어 연결 실패도 SSE error 이벤트로 전달된다.
async function streamAnthropic(prompt: string, apiKey: string): Promise<AsyncGenerator<string>> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const body = response.body;
  return (async function* () {
    for await (const data of parseSSE(body)) {
      const text = anthropicTextDelta(data);
      if (text) yield text;
    }
  })();
}

async function openGoogleStream(prompt: string, apiKey: string, model: string): Promise<ReadableStream<Uint8Array>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  return response.body;
}

// 연결 실패뿐 아니라 스트림 도중 실패(MAX_TOKENS 등)에도 다음 모델로 폴백한다.
// 이미 조각을 보냈다면 RESET으로 클라이언트가 지금까지의 코드를 비우게 한다.
function streamGoogle(prompt: string, apiKey: string): AsyncGenerator<StreamChunk> {
  return withStreamFallback(GOOGLE_MODELS, async (model) => {
    const body = await openGoogleStream(prompt, apiKey, model);
    return (async function* () {
      for await (const data of parseSSE(body)) {
        const text = googleTextDelta(data);
        if (text) yield text;
      }
    })();
  });
}

function errorResponse(message: string): Response {
  const { status, message: friendly } = friendlyErrorMessage(message);
  return Response.json({ error: friendly }, { status, headers: CORS_HEADERS });
}

function toSSEResponse(chunks: AsyncGenerator<StreamChunk>): Response {
  return new Response(toEventStream(chunks), {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
          prompt: string;
          apiKey?: string;
          provider?: Provider;
        };

        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!prompt) {
          return Response.json(
            { error: 'Prompt is required' },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const chunks =
          provider === 'google'
            ? streamGoogle(prompt, resolvedKey)
            : await streamAnthropic(prompt, resolvedKey);

        return toSSEResponse(chunks);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
