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

function aiError(message: string, code: string) {
  return { error: { message, code } };
}

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
      /* use status */
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

aiRouter.post(
  "/recipe-generate",
  zValidator("json", recipeSchema),
  async (c) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return c.json(aiError("AI service not configured", "AI_NOT_CONFIGURED"), 503);
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
      const content = await callXAI(apiKey, systemPrompt, `Create a recipe for: ${prompt}`, 1500, 0.8);
      const recipe = JSON.parse(cleanJsonResponse(content));
      return c.json({ data: recipe });
    } catch (err) {
      console.error("AI recipe generation error:", err);
      return c.json(aiError(err instanceof Error ? err.message : "AI request failed", "AI_ERROR"), 500);
    }
  }
);

aiRouter.post(
  "/recipe-parse",
  zValidator("json", parseSchema),
  async (c) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return c.json(aiError("AI service not configured", "AI_NOT_CONFIGURED"), 503);
    }

    const { text } = c.req.valid("json");

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
      const content = await callXAI(apiKey, systemPrompt, `Parse this recipe:\n\n${text}`, 2000, 0.5);
      const recipe = JSON.parse(cleanJsonResponse(content));
      return c.json({ data: recipe });
    } catch (err) {
      console.error("AI recipe parse error:", err);
      return c.json(aiError(err instanceof Error ? err.message : "AI request failed", "AI_ERROR"), 500);
    }
  }
);

aiRouter.post("/menu-generate", zValidator("json", menuSchema), async (c) => {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return c.json(aiError("AI service not configured", "AI_NOT_CONFIGURED"), 503);

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
    return c.json({ data: menu });
  } catch (err) {
    console.error("AI menu error:", err);
    return c.json(aiError(err instanceof Error ? err.message : "AI request failed", "AI_ERROR"), 500);
  }
});

aiRouter.post("/image-generate", zValidator("json", imageSchema), async (c) => {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return c.json(aiError("AI service not configured", "AI_NOT_CONFIGURED"), 503);

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
        /* use status */
      }
      return c.json(aiError(errMsg, "AI_API_ERROR"), 502);
    }

    const data = JSON.parse(body);

    if (format === "base64") {
      const base64 = data.data?.[0]?.b64_json;
      if (!base64) return c.json(aiError("No base64 data in response", "AI_NO_CONTENT"), 502);
      return c.json({ data: { base64 } });
    }

    const url = data.data?.[0]?.url;
    if (!url) return c.json(aiError("No image URL in response", "AI_NO_CONTENT"), 502);
    return c.json({ data: { url } });
  } catch (err) {
    console.error("AI image error:", err);
    return c.json(aiError(err instanceof Error ? err.message : "AI request failed", "AI_ERROR"), 500);
  }
});

aiRouter.post("/prep-list-generate", zValidator("json", prepListSchema), async (c) => {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return c.json(aiError("AI service not configured", "AI_NOT_CONFIGURED"), 503);

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
    return c.json({ data: prepList });
  } catch (err) {
    console.error("AI prep list error:", err);
    return c.json(aiError(err instanceof Error ? err.message : "AI request failed", "AI_ERROR"), 500);
  }
});

// ============================================
// Content Intelligence Endpoints (Phase 4D)
// ============================================

const classifyPostSchema = z.object({
  caption: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  postType: z.string().optional().default("photo"),
  hasImage: z.boolean().optional().default(false),
  hasVideo: z.boolean().optional().default(false),
});

aiRouter.post(
  "/classify-post",
  zValidator("json", classifyPostSchema),
  async (c) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return c.json(aiError("AI service not configured", "AI_NOT_CONFIGURED"), 503);

    const { caption, tags, postType, hasImage, hasVideo } = c.req.valid("json");

    const systemPrompt = `You are a food content classification system. Analyze the provided post and classify it.
Respond ONLY with a valid JSON object (no markdown, no code blocks):
{
  "food_categories": ["italian", "baking", "seafood"],
  "cuisine_type": "Italian",
  "dietary_tags": ["vegetarian", "gluten-free"],
  "mood": "comfort_food",
  "skill_level": "intermediate",
  "content_quality": 0.85,
  "suggested_tags": ["homemade", "pasta", "dinner"],
  "is_food_related": true
}
food_categories: 1-5 from [italian, mexican, asian, french, american, mediterranean, indian, japanese, korean, thai, baking, grilling, fermentation, foraging, seafood, vegan, desserts, drinks, farm, artisan, restaurant]
dietary_tags: any of [vegetarian, vegan, gluten-free, dairy-free, keto, paleo, nut-free, low-carb]
mood: one of [comfort_food, fine_dining, casual, healthy, indulgent, rustic, modern, traditional]
skill_level: one of [beginner, intermediate, advanced, professional]
content_quality: 0.0-1.0 estimate of content quality/effort`;

    try {
      const content = await callXAI(
        apiKey, systemPrompt,
        `Classify this ${postType} post:\nCaption: ${caption}\nExisting tags: ${tags.join(", ")}\nHas image: ${hasImage}, Has video: ${hasVideo}`,
        500, 0.3
      );
      const classification = JSON.parse(cleanJsonResponse(content));
      return c.json({ data: classification });
    } catch (err) {
      console.error("AI classify error:", err);
      return c.json(aiError(err instanceof Error ? err.message : "AI request failed", "AI_ERROR"), 500);
    }
  }
);

const captionSchema = z.object({
  postType: z.string().optional().default("photo"),
  tags: z.array(z.string()).optional().default([]),
  locationName: z.string().optional(),
  context: z.string().optional().default(""),
});

aiRouter.post(
  "/generate-caption",
  zValidator("json", captionSchema),
  async (c) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return c.json(aiError("AI service not configured", "AI_NOT_CONFIGURED"), 503);

    const { postType, tags, locationName, context } = c.req.valid("json");

    const systemPrompt = `You are a social media caption writer for a food-focused platform. Generate 3 engaging caption options.
Respond ONLY with a valid JSON object (no markdown, no code blocks):
{
  "captions": [
    { "text": "Short, catchy caption", "style": "casual" },
    { "text": "More descriptive caption with emoji", "style": "descriptive" },
    { "text": "Professional/storytelling caption", "style": "storytelling" }
  ]
}
Keep captions food-world appropriate. Include relevant food hashtags naturally.`;

    try {
      const content = await callXAI(
        apiKey, systemPrompt,
        `Generate captions for a ${postType} post.${context ? ` Context: ${context}` : ""}${tags.length ? ` Tags: ${tags.join(", ")}` : ""}${locationName ? ` Location: ${locationName}` : ""}`,
        500, 0.9
      );
      const result = JSON.parse(cleanJsonResponse(content));
      return c.json({ data: result });
    } catch (err) {
      console.error("AI caption error:", err);
      return c.json(aiError(err instanceof Error ? err.message : "AI request failed", "AI_ERROR"), 500);
    }
  }
);

const moderateSchema = z.object({
  caption: z.string().optional().default(""),
  body: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
});

aiRouter.post(
  "/moderate-content",
  zValidator("json", moderateSchema),
  async (c) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return c.json(aiError("AI service not configured", "AI_NOT_CONFIGURED"), 503);

    const { caption, body, tags } = c.req.valid("json");

    const systemPrompt = `You are a content moderation system for a food-focused social platform. Analyze the text for policy violations.
Respond ONLY with a valid JSON object (no markdown, no code blocks):
{
  "is_safe": true,
  "confidence": 0.95,
  "flags": [],
  "reason": null
}
flags can include: "spam", "harassment", "hate_speech", "adult_content", "misinformation", "self_promotion_excessive", "off_topic"
Set is_safe to false if any serious flags are found. Minor issues can still be safe with a note in reason.`;

    try {
      const content = await callXAI(
        apiKey, systemPrompt,
        `Moderate this content:\nCaption: ${caption}\nBody: ${body}\nTags: ${tags.join(", ")}`,
        300, 0.1
      );
      const result = JSON.parse(cleanJsonResponse(content));
      return c.json({ data: result });
    } catch (err) {
      console.error("AI moderate error:", err);
      return c.json(aiError(err instanceof Error ? err.message : "AI request failed", "AI_ERROR"), 500);
    }
  }
);

const searchSchema = z.object({
  query: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  limit: z.number().optional().default(20),
});

aiRouter.post(
  "/smart-search",
  zValidator("json", searchSchema),
  async (c) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return c.json(aiError("AI service not configured", "AI_NOT_CONFIGURED"), 503);

    const { query, latitude, longitude, limit } = c.req.valid("json");

    const systemPrompt = `You are a search query interpreter for a food platform. Parse the user's natural language query into structured search parameters.
Respond ONLY with a valid JSON object (no markdown, no code blocks):
{
  "search_terms": ["sourdough", "bread"],
  "post_types": ["photo", "recipe_share"],
  "tags": ["baking", "sourdough"],
  "cuisine_type": null,
  "dietary": [],
  "near_location": false,
  "intent": "discover"
}
intent: one of "discover", "learn", "buy", "find_business", "find_recipe"`;

    try {
      const content = await callXAI(
        apiKey, systemPrompt,
        `Parse this search query: "${query}"${latitude ? ` (user is near ${latitude},${longitude})` : ""}`,
        300, 0.3
      );
      const parsed = JSON.parse(cleanJsonResponse(content));
      return c.json({ data: { parsed, query, limit } });
    } catch (err) {
      console.error("AI search error:", err);
      return c.json(aiError(err instanceof Error ? err.message : "AI request failed", "AI_ERROR"), 500);
    }
  }
);

export { aiRouter };
