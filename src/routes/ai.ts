import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const aiRouter = new Hono();

const recipeSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
});

const parseSchema = z.object({
  text: z.string().min(1, "Text is required"),
});

const menuSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
});

const prepListSchema = z.object({
  menus: z.any(),
  recipes: z.any(),
});

const imageSchema = z.object({
  recipeTitle: z.string().min(1),
  recipeDescription: z.string().optional(),
  format: z.enum(["url", "base64"]).optional().default("url"),
});

/**
 * POST /api/ai/recipe-generate
 * Proxies recipe generation to xAI Grok API.
 * Requires XAI_API_KEY in environment.
 */
aiRouter.post(
  "/recipe-generate",
  zValidator("json", recipeSchema),
  async (c) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return c.json(
        { error: "AI service not configured (missing XAI_API_KEY)" },
        503
      );
    }

    const { prompt } = c.req.valid("json");

    const systemPrompt = `You are a professional chef and recipe creator. Generate a detailed, delicious recipe based on the user's request.
Respond ONLY with a valid JSON object in this exact format (no markdown, no code blocks, just pure JSON):
{
  "title": "Recipe Name",
  "description": "A brief 1-2 sentence description",
  "prepTime": "X min",
  "cookTime": "X min",
  "servings": 4,
  "difficulty": "Easy" or "Medium" or "Hard",
  "ingredients": ["ingredient 1 with measurement", "ingredient 2 with measurement", ...],
  "instructions": ["Step 1 instruction", "Step 2 instruction", ...],
  "tags": ["Tag1", "Tag2", "Tag3"]
}
Make the recipe practical, delicious, and include 6-10 ingredients and 5-8 clear instruction steps.`;

    try {
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-3",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Create a recipe for: ${prompt}` },
          ],
          max_tokens: 1500,
          temperature: 0.8,
        }),
      });

      const body = await response.text();
      if (!response.ok) {
        console.error("xAI recipe API error:", response.status, body);
        let errMsg = `xAI API error: ${response.status}`;
        try {
          const parsed = JSON.parse(body);
          if (parsed?.error?.message) {
            errMsg = parsed.error.message;
          }
        } catch {
          /* use status */
        }
        return c.json({ error: errMsg }, response.status as 400 | 502);
      }

      const data = JSON.parse(body);
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return c.json({ error: "No content in xAI response" }, 502);
      }

      // Clean markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
      if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
      if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);

      const recipe = JSON.parse(cleanContent.trim());
      return c.json(recipe);
    } catch (err) {
      console.error("AI recipe generation error:", err);
      return c.json(
        { error: err instanceof Error ? err.message : "AI request failed" },
        500
      );
    }
  }
);

/**
 * POST /api/ai/recipe-parse
 * Parses pasted/rough recipe text into structured JSON.
 */
aiRouter.post(
  "/recipe-parse",
  zValidator("json", parseSchema),
  async (c) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return c.json(
        { error: "AI service not configured (missing XAI_API_KEY)" },
        503
      );
    }

    const { text } = c.req.valid("json");
    const prompt = `Parse this recipe:\n\n${text}`;

    const systemPrompt = `You are a recipe parsing assistant. Parse the provided text and extract recipe information.
Respond ONLY with a valid JSON object in this exact format (no markdown, no code blocks, just pure JSON):
{
  "title": "Recipe Name",
  "description": "A brief 1-2 sentence description",
  "prepTime": "X min",
  "cookTime": "X min",
  "servings": 4,
  "difficulty": "Easy" or "Medium" or "Hard",
  "ingredients": ["ingredient 1 with measurement", "ingredient 2 with measurement", ...],
  "instructions": ["Step 1 instruction", "Step 2 instruction", ...],
  "tags": ["Tag1", "Tag2", "Tag3"]
}
If any information is missing, make reasonable estimates. Extract all ingredients and instructions from the text.`;

    try {
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-3",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          max_tokens: 2000,
          temperature: 0.5,
        }),
      });

      const body = await response.text();
      if (!response.ok) {
        console.error("xAI parse API error:", response.status, body);
        let errMsg = `xAI API error: ${response.status}`;
        try {
          const parsed = JSON.parse(body);
          if (parsed?.error?.message) errMsg = parsed.error.message;
        } catch {
          /* ok */
        }
        return c.json({ error: errMsg }, response.status as 400 | 502);
      }

      const data = JSON.parse(body);
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return c.json({ error: "No content in xAI response" }, 502);
      }

      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
      if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
      if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);

      const recipe = JSON.parse(cleanContent.trim());
      return c.json(recipe);
    } catch (err) {
      console.error("AI recipe parse error:", err);
      return c.json(
        { error: err instanceof Error ? err.message : "AI request failed" },
        500
      );
    }
  }
);

async function callXAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1500,
  temperature = 0.8
): Promise<string> {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-3",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    let errMsg = `xAI API error: ${response.status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) errMsg = parsed.error.message;
    } catch {
      /* ok */
    }
    throw new Error(errMsg);
  }

  const data = JSON.parse(body);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in xAI response");
  return content;
}

function cleanJsonResponse(content: string): string {
  let clean = content.trim();
  if (clean.startsWith("```json")) clean = clean.slice(7);
  if (clean.startsWith("```")) clean = clean.slice(3);
  if (clean.endsWith("```")) clean = clean.slice(0, -3);
  return clean.trim();
}

/**
 * POST /api/ai/menu-generate
 */
aiRouter.post("/menu-generate", zValidator("json", menuSchema), async (c) => {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return c.json({ error: "AI service not configured (missing XAI_API_KEY)" }, 503);

  const { prompt } = c.req.valid("json");
  const systemPrompt = `You are a professional chef and menu planner. Generate a detailed, elegant menu based on the user's request.
Respond ONLY with a valid JSON object in this exact format (no markdown, no code blocks, just pure JSON):
{
  "title": "Menu Title",
  "description": "A brief description of the menu theme and style",
  "occasion": "The type of occasion (e.g., Dinner Party, Holiday, Catering)",
  "guestCount": 8,
  "items": [
    {
      "courseName": "Course Name (e.g., Appetizer, First Course, Main Course, Dessert)",
      "itemName": "Dish Name",
      "description": "Brief description of the dish"
    }
  ]
}
Create a complete, well-balanced menu with appropriate courses. For a multi-course dinner, include appetizer, soup/salad, main course, and dessert at minimum. Be creative and match the theme requested.`;

  try {
    const content = await callXAI(apiKey, systemPrompt, `Create a menu for: ${prompt}`, 1500, 0.8);
    const menu = JSON.parse(cleanJsonResponse(content));
    return c.json(menu);
  } catch (err) {
    console.error("AI menu error:", err);
    return c.json({ error: err instanceof Error ? err.message : "AI request failed" }, 500);
  }
});

/**
 * POST /api/ai/image-generate
 * Generates a recipe image via xAI Grok Imagine.
 */
aiRouter.post("/image-generate", zValidator("json", imageSchema), async (c) => {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return c.json({ error: "AI service not configured (missing XAI_API_KEY)" }, 503);

  const { recipeTitle, recipeDescription, format } = c.req.valid("json");
  const prompt = `Professional food photography of ${recipeTitle.trim()}. ${recipeDescription ? `${recipeDescription}.` : ""} Beautifully plated, appetizing, soft natural lighting, shallow depth of field, 45-degree angle, clean minimal background, photorealistic. No text, no labels, no words, no watermarks, no titles.`;

  try {
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt,
        n: 1,
        response_format: format === "base64" ? "b64_json" : "url",
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      console.error("xAI image API error:", response.status, body);
      let errMsg = `xAI image API error: ${response.status}`;
      try {
        const parsed = JSON.parse(body);
        if (parsed?.error?.message) errMsg = parsed.error.message;
      } catch {
        /* ok */
      }
      return c.json({ error: errMsg }, response.status as 400 | 502);
    }

    const data = JSON.parse(body);

    if (format === "base64") {
      const base64 = data.data?.[0]?.b64_json;
      if (!base64) return c.json({ error: "No base64 data in response" }, 502);
      return c.json({ base64 });
    }

    const url = data.data?.[0]?.url;
    if (!url) return c.json({ error: "No image URL in response" }, 502);
    return c.json({ url });
  } catch (err) {
    console.error("AI image error:", err);
    return c.json({ error: err instanceof Error ? err.message : "AI request failed" }, 500);
  }
});

/**
 * POST /api/ai/prep-list-generate
 */
aiRouter.post("/prep-list-generate", zValidator("json", prepListSchema), async (c) => {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return c.json({ error: "AI service not configured (missing XAI_API_KEY)" }, 503);

  const { menus, recipes } = c.req.valid("json");
  const systemPrompt = `You are an expert chef and kitchen manager. Create a comprehensive prep list and to-do list for preparing the menu(s) provided. Organize tasks by timing category and priority.

Respond ONLY with a valid JSON object (no markdown, no code blocks, just the raw JSON):
{
  "title": "Prep List Title",
  "overview": "Brief overview of what needs to be done",
  "tasks": [
    {
      "task": "Specific task description",
      "category": "advance",
      "estimatedTime": "30 min",
      "priority": "high",
      "menuItem": "Related menu item name",
      "recipe": "Related recipe name"
    }
  ],
  "tips": ["Pro tip 1", "Pro tip 2"]
}

Valid category values: "advance", "day-before", "day-of", "service"
Valid priority values: "high", "medium", "low"

Categories: advance (2+ days ahead), day-before, day-of, service (during active service).`;

  const userPrompt = `Create a prep list for these menu(s):

MENUS:
${JSON.stringify(menus, null, 2)}

LINKED RECIPES:
${JSON.stringify(recipes, null, 2)}

Generate a comprehensive, practical prep list that a chef can follow to efficiently prepare for service.`;

  try {
    const content = await callXAI(apiKey, systemPrompt, userPrompt, 3000, 0.7);
    const prepList = JSON.parse(cleanJsonResponse(content));
    return c.json(prepList);
  } catch (err) {
    console.error("AI prep list error:", err);
    return c.json({ error: err instanceof Error ? err.message : "AI request failed" }, 500);
  }
});

export { aiRouter };
