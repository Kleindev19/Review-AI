
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("ERROR: Gemini API key is missing.");
  process.exitCode = 1;
} else {
  const ai = new GoogleGenAI({ apiKey });

  try {
    console.log("Testing Gemini API...");

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: "Say hello in one short sentence.",
    });

    console.log("SUCCESS!");
    console.log("Gemini response:", response.text);
  } catch (error) {
    console.error("GEMINI API ERROR");
    console.error("Status:", error.status ?? "Unknown");
    console.error("Message:", error.message);
    process.exitCode = 1;
  }
}
