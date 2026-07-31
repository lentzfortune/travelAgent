import OpenAI from "openai";
import { Pool, PoolClient } from "pg";
import { getJson } from "serpapi";

export const runtime = "nodejs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const USER_NAME = "Unregistered user";
const AGENT_NAME = "Travel agent";
const EMBEDDING_MODEL = "text-embedding-3-small";
const SEMANTIC_CACHE_THRESHOLD = Number(
  process.env.SEMANTIC_CACHE_THRESHOLD || "0.95",
);
const SEMANTIC_CACHE_MAX_AGE_MINUTES = Number(
  process.env.SEMANTIC_CACHE_MAX_AGE_MINUTES || "15",
);
const MAX_CONTEXT_MESSAGES = 40;

const TRAVEL_AGENT_INSTRUCTIONS = `
You are a practical, friendly travel planning agent.

After the initial input you provide customer with relevant with possible flights. 
Then you provide them with hotels and activities they could do at the city they have landed in.
`.trim();

type Role = "user" | "assistant";
type StoredMessage = {
  id: number;
  role: Role;
  content: string;
  createdAt: string;
};

type FlightSearchArgs = {
  departure_id: string;
  arrival_id: string;
  outbound_date: string;
  return_date: string | null;
  trip_type: "round_trip" | "one_way";
  travel_class: "economy" | "premium_economy" | "business" | "first";
  adults: number;
  children: number;
  stops: "any" | "nonstop" | "one_or_fewer" | "two_or_fewer";
  currency: string;
};

const flightTools: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "search_flights",
    description:
      "Search current Google Flights results through SerpApi. Use for specific routes, dates, schedules, or price questions. Airport IDs must be IATA codes.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        departure_id: {
          type: "string",
          description:
            "Uppercase 3-letter IATA departure airport code, or comma-separated codes.",
        },
        arrival_id: {
          type: "string",
          description:
            "Uppercase 3-letter IATA arrival airport code, or comma-separated codes.",
        },
        outbound_date: {
          type: "string",
          description: "Outbound date in YYYY-MM-DD format.",
        },
        return_date: {
          type: ["string", "null"],
          description:
            "Return date in YYYY-MM-DD format for a round trip; null for one way.",
        },
        trip_type: {
          type: "string",
          enum: ["round_trip", "one_way"],
        },
        travel_class: {
          type: "string",
          enum: ["economy", "premium_economy", "business", "first"],
        },
        adults: {
          type: "integer",
          minimum: 1,
          maximum: 9,
        },
        children: {
          type: "integer",
          minimum: 0,
          maximum: 8,
        },
        stops: {
          type: "string",
          enum: ["any", "nonstop", "one_or_fewer", "two_or_fewer"],
        },
        currency: {
          type: "string",
          description: "Uppercase ISO 4217 currency code, such as USD.",
        },
      },
      required: [
        "departure_id",
        "arrival_id",
        "outbound_date",
        "return_date",
        "trip_type",
        "travel_class",
        "adults",
        "children",
        "stops",
        "currency",
      ],
      additionalProperties: false,
    },
  },
];

function assertConfiguration() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  if (!process.env.SERP_API_KEY) {
    throw new Error("SERP_API_KEY is not configured.");
  }
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function summarizeFlight(option: Record<string, unknown>) {
  const segments = Array.isArray(option.flights) ? option.flights : [];
  return {
    price: option.price,
    type: option.type,
    total_duration_minutes: option.total_duration,
    segments: segments.map((segment: Record<string, unknown>) => ({
      departure_airport: segment.departure_airport,
      arrival_airport: segment.arrival_airport,
      airline: segment.airline,
      flight_number: segment.flight_number,
      duration_minutes: segment.duration,
      travel_class: segment.travel_class,
      often_delayed_by_over_30_min: segment.often_delayed_by_over_30_min,
    })),
    layovers: option.layovers,
    extensions: option.extensions,
  };
}

async function searchFlights(args: FlightSearchArgs) {
  if (!isDate(args.outbound_date)) {
    throw new Error("outbound_date must use YYYY-MM-DD.");
  }
  if (args.trip_type === "round_trip" && !args.return_date) {
    throw new Error("return_date is required for a round trip.");
  }
  if (args.return_date && !isDate(args.return_date)) {
    throw new Error("return_date must use YYYY-MM-DD.");
  }

  const travelClass = {
    economy: 1,
    premium_economy: 2,
    business: 3,
    first: 4,
  }[args.travel_class];
  const stops = {
    any: 0,
    nonstop: 1,
    one_or_fewer: 2,
    two_or_fewer: 3,
  }[args.stops];

  const result = await getJson({
    engine: "google_flights",
    api_key: process.env.SERP_API_KEY,
    departure_id: args.departure_id.toUpperCase(),
    arrival_id: args.arrival_id.toUpperCase(),
    outbound_date: args.outbound_date,
    ...(args.return_date ? { return_date: args.return_date } : {}),
    type: args.trip_type === "round_trip" ? 1 : 2,
    travel_class: travelClass,
    adults: args.adults,
    children: args.children,
    stops,
    currency: args.currency.toUpperCase(),
    hl: "en",
    gl: "us",
    deep_search: true,
  });

  if (typeof result.error === "string") {
    throw new Error(`SerpApi flight search failed: ${result.error}`);
  }

  const bestFlights = Array.isArray(result.best_flights)
    ? result.best_flights
    : [];
  const otherFlights = Array.isArray(result.other_flights)
    ? result.other_flights
    : [];

  return {
    source: "Google Flights via SerpApi",
    fetched_at: new Date().toISOString(),
    search_parameters: result.search_parameters,
    price_insights: result.price_insights,
    best_flights: bestFlights.slice(0, 5).map(summarizeFlight),
    other_flights: otherFlights.slice(0, 3).map(summarizeFlight),
    note:
      args.trip_type === "round_trip"
        ? "Displayed prices are round-trip estimates, but these results show outbound options. Final return itinerary and fare must be confirmed before booking."
        : "Prices and availability can change before booking.",
  };
}

async function createAgentResponse(
  openai: OpenAI,
  history: StoredMessage[],
) {
  const input: OpenAI.Responses.ResponseInput = history.map(
    ({ role, content }) => ({ role, content }),
  );

  for (let round = 0; round < 3; round += 1) {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",
      instructions: TRAVEL_AGENT_INSTRUCTIONS,
      input,
      tools: flightTools,
      parallel_tool_calls: false,
    });

    const continuationItems = response.output.filter(
      (item) =>
        item.type === "reasoning" ||
        item.type === "function_call" ||
        item.type === "message",
    );
    input.push(...continuationItems);
    const calls = response.output.filter(
      (item) => item.type === "function_call",
    );

    if (calls.length === 0) return response.output_text.trim();

    for (const call of calls) {
      let output: string;
      try {
        if (call.name !== "search_flights") {
          throw new Error(`Unknown tool: ${call.name}`);
        }
        const args = JSON.parse(call.arguments) as FlightSearchArgs;
        output = JSON.stringify(await searchFlights(args));
      } catch (error) {
        output = JSON.stringify({
          error:
            error instanceof Error ? error.message : "Flight search failed.",
        });
      }

      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output,
      });
    }
  }

  throw new Error("The flight search used too many tool rounds.");
}

async function createEmbedding(openai: OpenAI, text: string) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: "float",
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error("OpenAI returned an empty embedding.");
  return `[${embedding.join(",")}]`;
}

type CachedResponse = {
  answer: string;
  embedding: string;
  similarity: number;
};

async function findCachedAgentResponse(
  client: PoolClient,
  agentId: number,
  queryEmbedding: string,
) {
  const result = await client.query<CachedResponse>(
    `SELECT
       userinput AS answer,
       embedding::text AS embedding,
       1 - (embedding <=> $1::vector) AS similarity
     FROM message
     WHERE user_id = $2
       AND created_at >= now() - ($3 * interval '1 minute')
     ORDER BY embedding <=> $1::vector
     LIMIT 1`,
    [queryEmbedding, agentId, SEMANTIC_CACHE_MAX_AGE_MINUTES],
  );
  const match = result.rows[0];
  return match && match.similarity >= SEMANTIC_CACHE_THRESHOLD ? match : null;
}

async function getOrCreateCategory(client: PoolClient, categoryName: string) {
  const result = await client.query<{ category_id: number }>(
    `INSERT INTO usercategory (categoryname)
     VALUES ($1)
     ON CONFLICT (categoryname)
     DO UPDATE SET categoryname = EXCLUDED.categoryname
     RETURNING category_id`,
    [categoryName],
  );
  return result.rows[0].category_id;
}

async function getOrCreateUser(
  client: PoolClient,
  userName: string,
  categoryId: number,
) {
  const existing = await client.query<{ id: number }>(
    `SELECT id FROM users
     WHERE LOWER(username) = LOWER($1) AND category_id = $2
     ORDER BY id LIMIT 1`,
    [userName, categoryId],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await client.query<{ id: number }>(
    `INSERT INTO users (username, category_id)
     VALUES ($1, $2)
     RETURNING id`,
    [userName, categoryId],
  );
  return created.rows[0].id;
}

async function getParticipants(client: PoolClient) {
  const userCategoryId = await getOrCreateCategory(client, "user");
  const agentCategoryId = await getOrCreateCategory(client, "assistant");
  const userId = await getOrCreateUser(client, USER_NAME, userCategoryId);
  const agentId = await getOrCreateUser(client, AGENT_NAME, agentCategoryId);
  return { userId, agentId };
}

function errorResponse(error: unknown) {
  console.error("Travel agent request failed:", error);
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("DATABASE_URL") ||
    message.includes("OPENAI_API_KEY") ||
    message.includes("SERP_API_KEY")
  ) {
    return Response.json({ error: message }, { status: 500 });
  }
  if (
    error instanceof OpenAI.APIError &&
    (error.status === 401 || error.status === 403)
  ) {
    return Response.json(
      { error: "OpenAI rejected the API key. Check OPENAI_API_KEY." },
      { status: 502 },
    );
  }
  if (error instanceof OpenAI.APIError && error.status === 429) {
    return Response.json(
      {
        error:
          "OpenAI rate or credit limit reached. If credits were just added, wait briefly and retry.",
      },
      { status: 429 },
    );
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("28")
  ) {
    return Response.json(
      { error: "The database rejected the configured credentials." },
      { status: 502 },
    );
  }
  return Response.json(
    {
      error:
        "The server could not complete the chat request. Check its terminal log.",
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  let client: PoolClient | undefined;
  try {
    assertConfiguration();
    const body: unknown = await request.json();
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message.trim()
        : "";
    const requestHistory =
      typeof body === "object" &&
      body !== null &&
      "history" in body &&
      Array.isArray(body.history)
        ? body.history
            .filter(
              (item): item is StoredMessage =>
                typeof item === "object" &&
                item !== null &&
                "role" in item &&
                (item.role === "user" || item.role === "assistant") &&
                "content" in item &&
                typeof item.content === "string" &&
                "id" in item &&
                typeof item.id === "number" &&
                "createdAt" in item &&
                typeof item.createdAt === "string",
            )
            .slice(-(MAX_CONTEXT_MESSAGES - 1))
            .map((item) => ({
              ...item,
              content: item.content.slice(0, 10_000),
            }))
        : [];

    if (!message) {
      return Response.json(
        { error: "Please describe the trip you want to plan." },
        { status: 400 },
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const userEmbedding = await createEmbedding(openai, message);
    const pendingUserMessage: StoredMessage = {
      id: 0,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };
    const history = [...requestHistory, pendingUserMessage];

    client = await pool.connect();
    await client.query("BEGIN");
    const { userId, agentId } = await getParticipants(client);
    const cachedResponse = await findCachedAgentResponse(
      client,
      agentId,
      userEmbedding,
    );
    let answer: string;
    let agentEmbedding: string;
    let cacheSimilarity: number | null = null;

    if (cachedResponse) {
      answer = cachedResponse.answer;
      agentEmbedding = cachedResponse.embedding;
      cacheSimilarity = cachedResponse.similarity;
    } else {
      await client.query("COMMIT");
      client.release();
      client = undefined;

      answer = await createAgentResponse(openai, history);
      if (!answer) throw new Error("OpenAI returned an empty response.");
      agentEmbedding = await createEmbedding(openai, answer);

      client = await pool.connect();
      await client.query("BEGIN");
    }

    const userMessageResult = await client.query<{
      id: number;
      created_at: Date;
    }>(
      `INSERT INTO message (user_id, userinput, embedding)
       VALUES ($1, $2, $3::vector)
       RETURNING message_id AS id, created_at`,
      [userId, message, userEmbedding],
    );
    const userMessage: StoredMessage = {
      ...pendingUserMessage,
      id: userMessageResult.rows[0].id,
      createdAt: userMessageResult.rows[0].created_at.toISOString(),
    };

    const agentMessageResult = await client.query<{
      id: number;
      created_at: Date;
    }>(
      `INSERT INTO message (user_id, userinput, embedding)
       VALUES ($1, $2, $3::vector)
       RETURNING message_id AS id, created_at`,
      [agentId, answer, agentEmbedding],
    );
    const agentMessage: StoredMessage = {
      id: agentMessageResult.rows[0].id,
      role: "assistant",
      content: answer,
      createdAt: agentMessageResult.rows[0].created_at.toISOString(),
    };
    await client.query("COMMIT");

    return Response.json({
      answer,
      messages: [...requestHistory, userMessage, agentMessage],
      cache: {
        hit: cacheSimilarity !== null,
        similarity: cacheSimilarity,
      },
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    return errorResponse(error);
  } finally {
    client?.release();
  }
}
