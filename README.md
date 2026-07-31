This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
This project uses Nextjs, Nodejs, and Supabase

## Local configuration

Create a `.env.local` file in the project root:

```bash
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.yukuubgzpaooozgeyeud.supabase.co:5432/postgres
SERP_API_KEY=your_serpapi_key
# Optional; defaults to gpt-5
OPENAI_MODEL=gpt-5
```

This project is an AI agent that assists with planning trips. It uses SerpAPI which uses google flight data to provide the user with live flight data. The agent is powered by OpenAi's gpt 5. It stores conversation history in the browser for current sessions, but once a new sesssion has started it saves the old conversations in a database provided by Supabase. The DB schema is provided in the respository. Retrieval Augment Generation concepts were explored in this project too. By using OpenAi's embeddings API, I was able to create an embedding for each message generated, whether by the user or the agent, and store it in the database. This allows the agent to creat an embedding for the current input and compare it to the embeddings already in the database to see if there is better context for the new response it is generating. This project integrate modern AI technologies to create a conversational travel agent. 

## Getting Started

First, run the development server:


npm run dev


Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
