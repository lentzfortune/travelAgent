import OpenAI from "openai";
import { NextResponse } from "next/server";


const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message } = body;

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "A message is required." },
        { status: 400 }
      );
    }

    const response = await client.responses.create({
      model: "gpt-5",
      input: message,
    });

    return NextResponse.json({
      answer: response.output_text,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Unable to generate a response." },
      { status: 500 }
    );
  }
}






