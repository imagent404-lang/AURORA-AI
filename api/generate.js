export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    // Check that the OpenAI key exists on the SERVER
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("OPENAI_API_KEY is missing");

      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured in Vercel."
      });
    }

    const formData = req.body || {};

    const {
      device = "",
      ram = "",
      model = "",
      refreshRate = "",
      playerStyle = "",
      generationMode = ""
    } = formData;

    // Ask OpenAI to generate the profile
    const prompt = `
You are AURORA, a gaming sensitivity recommendation engine.

Create a reasonable starting sensitivity profile from the following information:

Device brand: ${device}
RAM: ${ram}
Device model: ${model}
Refresh rate: ${refreshRate}
Player style: ${playerStyle}
Generation mode: ${generationMode}

Return ONLY valid JSON.
Do not use markdown.
Do not add explanations outside the JSON.

The JSON must have exactly these fields:

{
  "general": number,
  "redDot": number,
  "scope2x": number,
  "scope4x": number,
  "sniper": number,
  "freeLook": number,
  "profileName": string,
  "summary": string,
  "adjustmentTips": string
}

All six sensitivity values must be integers from 0 to 100.

Make the values a sensible starting profile, not a guaranteed result.
`;

    const openAIResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          input: prompt
        })
      }
    );

    const responseText = await openAIResponse.text();

    if (!openAIResponse.ok) {
      console.error("OpenAI API error:", responseText);

      return res.status(openAIResponse.status).json({
        error: "OpenAI API request failed.",
        details: responseText
      });
    }

    let openAIData;

    try {
      openAIData = JSON.parse(responseText);
    } catch {
      console.error("Invalid OpenAI response:", responseText);

      return res.status(500).json({
        error: "Invalid response received from OpenAI."
      });
    }

    // Responses API normally exposes the generated text here
    let output = openAIData.output_text;

    if (!output && Array.isArray(openAIData.output)) {
      output = openAIData.output
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("");
    }

    if (!output) {
      console.error("No output text:", openAIData);

      return res.status(500).json({
        error: "OpenAI returned no generated text."
      });
    }

    // Remove accidental markdown code fences
    output = output
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let profile;

    try {
      profile = JSON.parse(output);
    } catch {
      console.error("Model returned invalid JSON:", output);

      return res.status(500).json({
        error: "AI returned invalid profile data."
      });
    }

    // Make sure all sensitivity values are numbers
    const numberFields = [
      "general",
      "redDot",
      "scope2x",
      "scope4x",
      "sniper",
      "freeLook"
    ];

    for (const field of numberFields) {
      profile[field] = Math.max(
        0,
        Math.min(
          100,
          Math.round(Number(profile[field]) || 0)
        )
      );
    }

    // Make sure the fields expected by your index.html exist
    profile.profileName =
      String(profile.profileName || "AURORA PROFILE");

    profile.summary =
      String(profile.summary || "AI-generated starting profile.");

    profile.adjustmentTips =
      String(
        profile.adjustmentTips ||
        "Adjust gradually based on your personal touch response."
      );

    return res.status(200).json(profile);

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Server error while generating profile.",
      details: error.message
    });
  }
}
