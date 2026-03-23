import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import OpenAI from "openai";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimited = rateLimit(request, "ai-edit", { limit: 20, windowSeconds: 60 });
  if (rateLimited) return rateLimited;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    );
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { text, prompt } = await request.json();

  if (!prompt) {
    return NextResponse.json(
      { error: "Missing prompt" },
      { status: 400 }
    );
  }

  const isGenerate = !text;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: isGenerate
        ? [
            {
              role: "system",
              content:
                "You are a helpful writing assistant. The user will give you an instruction and you should generate text based on it. Return ONLY the generated text. Do not wrap your response in quotes, backticks, or any other delimiters. Do not add any explanation or preamble.",
            },
            {
              role: "user",
              content: prompt,
            },
          ]
        : [
            {
              role: "system",
              content:
                "You are a helpful writing assistant. The user will provide some text and an instruction for how to edit it. Return ONLY the edited text. Do not wrap your response in quotes, backticks, or any other delimiters. Do not add any explanation or preamble.",
            },
            {
              role: "user",
              content: `Here is the text:\n${text}\n\nEdit it according to this instruction: ${prompt}`,
            },
          ],
      temperature: 0.7,
    });

    let editedText = completion.choices[0]?.message?.content?.trim();
    if (editedText) {
      editedText = editedText.replace(/^"""\s*\n?/, "").replace(/\n?\s*"""$/, "");
      editedText = editedText.replace(/^"\s*\n?/, "").replace(/\n?\s*"$/, "");
    }

    if (!editedText) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    return NextResponse.json({ editedText });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process AI edit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
