import { Hono } from 'hono';
import { supabase } from '../supabase';
import {
  CreateMenuCategorySchema,
  UpdateMenuCategorySchema,
  CreateMenuItemSchema,
  UpdateMenuItemSchema,
  CreateModifierGroupSchema,
  UpdateModifierGroupSchema,
  CreateModifierSchema,
  UpdateModifierSchema,
} from '../types';

const menuRoutes = new Hono();

// Helper to convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Helper to convert camelCase to snake_case
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Convert object keys from snake_case to camelCase
function toCamelCase<T>(obj: any): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item)) as T;
  }
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      const camelKey = snakeToCamel(key);
      newObj[camelKey] = toCamelCase(obj[key]);
    }
    return newObj as T;
  }
  return obj;
}

// Convert object keys from camelCase to snake_case for Supabase insert/update
function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => toSnakeCase(item));
  }
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      const snakeKey = camelToSnake(key);
      newObj[snakeKey] = toSnakeCase(obj[key]);
    }
    return newObj;
  }
  return obj;
}

// ============================================
// Menu Categories
// ============================================

// Get all categories for a business (with items)
menuRoutes.get('/:businessId/categories', async (c) => {
  const { businessId } = c.req.param();

  // Get categories
  const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('business_id', businessId)
    .order('display_order', { ascending: true });

  if (catError) {
    return c.json({ error: { message: catError.message, code: 'DB_ERROR' } }, 500);
  }

  // Get items for all categories
  const categoryIds = categories?.map((cat) => cat.id) || [];

  let items: any[] = [];
  if (categoryIds.length > 0) {
    const { data: itemsData, error: itemsError } = await supabase
      .from('menu_items')
      .select('*')
      .in('category_id', categoryIds)
      .order('display_order', { ascending: true });

    if (itemsError) {
      return c.json({ error: { message: itemsError.message, code: 'DB_ERROR' } }, 500);
    }
    items = itemsData || [];
  }

  // Get modifier groups for all items
  const itemIds = items.map((item) => item.id);
  let modifierGroups: any[] = [];
  if (itemIds.length > 0) {
    const { data: groupsData, error: groupsError } = await supabase
      .from('menu_modifier_groups')
      .select('*')
      .in('menu_item_id', itemIds)
      .order('display_order', { ascending: true });

    if (groupsError) {
      return c.json({ error: { message: groupsError.message, code: 'DB_ERROR' } }, 500);
    }
    modifierGroups = groupsData || [];
  }

  // Get modifiers for all modifier groups
  const groupIds = modifierGroups.map((g) => g.id);
  let modifiers: any[] = [];
  if (groupIds.length > 0) {
    const { data: modifiersData, error: modifiersError } = await supabase
      .from('menu_modifiers')
      .select('*')
      .in('modifier_group_id', groupIds)
      .order('display_order', { ascending: true });

    if (modifiersError) {
      return c.json({ error: { message: modifiersError.message, code: 'DB_ERROR' } }, 500);
    }
    modifiers = modifiersData || [];
  }

  // Assemble the nested structure
  const modifiersByGroup = new Map<string, any[]>();
  for (const mod of modifiers) {
    const groupId = mod.modifier_group_id;
    if (!modifiersByGroup.has(groupId)) {
      modifiersByGroup.set(groupId, []);
    }
    modifiersByGroup.get(groupId)!.push(toCamelCase(mod));
  }

  const groupsByItem = new Map<string, any[]>();
  for (const group of modifierGroups) {
    const itemId = group.menu_item_id;
    if (!groupsByItem.has(itemId)) {
      groupsByItem.set(itemId, []);
    }
    const camelGroup = toCamelCase<any>(group);
    camelGroup.modifiers = modifiersByGroup.get(group.id) || [];
    groupsByItem.get(itemId)!.push(camelGroup);
  }

  const itemsByCategory = new Map<string, any[]>();
  for (const item of items) {
    const catId = item.category_id;
    if (!itemsByCategory.has(catId)) {
      itemsByCategory.set(catId, []);
    }
    const camelItem = toCamelCase<any>(item);
    camelItem.modifierGroups = groupsByItem.get(item.id) || [];
    itemsByCategory.get(catId)!.push(camelItem);
  }

  const result = (categories || []).map((cat) => {
    const camelCat = toCamelCase<any>(cat);
    camelCat.items = itemsByCategory.get(cat.id) || [];
    return camelCat;
  });

  return c.json({ data: result });
});

// Get single category
menuRoutes.get('/:businessId/categories/:categoryId', async (c) => {
  const { businessId, categoryId } = c.req.param();

  const { data: category, error } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('id', categoryId)
    .eq('business_id', businessId)
    .single();

  if (error || !category) {
    return c.json({ error: { message: 'Category not found', code: 'NOT_FOUND' } }, 404);
  }

  // Get items for this category
  const { data: items } = await supabase
    .from('menu_items')
    .select('*')
    .eq('category_id', categoryId)
    .order('display_order', { ascending: true });

  const camelCategory = toCamelCase<any>(category);
  camelCategory.items = toCamelCase(items || []);

  return c.json({ data: camelCategory });
});

// Create category
menuRoutes.post('/:businessId/categories', async (c) => {
  const { businessId } = c.req.param();
  const body = await c.req.json();

  const parsed = CreateMenuCategorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify business exists
  const { data: business, error: bizError } = await supabase
    .from('business_accounts')
    .select('id')
    .eq('id', businessId)
    .single();

  if (bizError || !business) {
    return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
  }

  // Get max display order
  const { data: maxOrderResult } = await supabase
    .from('menu_categories')
    .select('display_order')
    .eq('business_id', businessId)
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const maxOrder = maxOrderResult?.display_order ?? 0;

  const insertData = {
    business_id: businessId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    image_url: parsed.data.imageUrl || null,
    display_order: parsed.data.displayOrder ?? maxOrder + 1,
    is_active: parsed.data.isActive ?? true,
    available_start_time: parsed.data.availableStartTime || null,
    available_end_time: parsed.data.availableEndTime || null,
    available_days: parsed.data.availableDays ? JSON.stringify(parsed.data.availableDays) : null,
  };

  const { data: category, error } = await supabase
    .from('menu_categories')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  return c.json({ data: toCamelCase(category) }, 201);
});

// Update category
menuRoutes.put('/:businessId/categories/:categoryId', async (c) => {
  const { businessId, categoryId } = c.req.param();
  const body = await c.req.json();

  const parsed = UpdateMenuCategorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Check if category exists
  const { data: existing, error: existError } = await supabase
    .from('menu_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('business_id', businessId)
    .single();

  if (existError || !existing) {
    return c.json({ error: { message: 'Category not found', code: 'NOT_FOUND' } }, 404);
  }

  // Build update data
  const updateData: any = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.imageUrl !== undefined) updateData.image_url = parsed.data.imageUrl;
  if (parsed.data.displayOrder !== undefined) updateData.display_order = parsed.data.displayOrder;
  if (parsed.data.isActive !== undefined) updateData.is_active = parsed.data.isActive;
  if (parsed.data.availableStartTime !== undefined) updateData.available_start_time = parsed.data.availableStartTime;
  if (parsed.data.availableEndTime !== undefined) updateData.available_end_time = parsed.data.availableEndTime;
  if (parsed.data.availableDays !== undefined) updateData.available_days = JSON.stringify(parsed.data.availableDays);
  updateData.updated_at = new Date().toISOString();

  const { data: category, error } = await supabase
    .from('menu_categories')
    .update(updateData)
    .eq('id', categoryId)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  return c.json({ data: toCamelCase(category) });
});

// Delete category
menuRoutes.delete('/:businessId/categories/:categoryId', async (c) => {
  const { businessId, categoryId } = c.req.param();

  // Check if category exists
  const { data: existing, error: existError } = await supabase
    .from('menu_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('business_id', businessId)
    .single();

  if (existError || !existing) {
    return c.json({ error: { message: 'Category not found', code: 'NOT_FOUND' } }, 404);
  }

  const { error } = await supabase
    .from('menu_categories')
    .delete()
    .eq('id', categoryId);

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  return c.body(null, 204);
});

// Reorder categories
menuRoutes.put('/:businessId/categories/reorder', async (c) => {
  const { businessId } = c.req.param();
  const body = await c.req.json();

  if (!Array.isArray(body.categoryIds)) {
    return c.json({ error: { message: 'categoryIds array required', code: 'VALIDATION_ERROR' } }, 400);
  }

  // Update display order for each category
  const updates = body.categoryIds.map((id: string, index: number) =>
    supabase
      .from('menu_categories')
      .update({ display_order: index, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', businessId)
  );

  await Promise.all(updates);

  return c.json({ data: { success: true } });
});

// ============================================
// Menu Items
// ============================================

// Get all items for a business
menuRoutes.get('/:businessId/items', async (c) => {
  const { businessId } = c.req.param();
  const categoryId = c.req.query('categoryId');

  let query = supabase
    .from('menu_items')
    .select('*')
    .eq('business_id', businessId)
    .order('display_order', { ascending: true });

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data: items, error } = await query;

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  // Get categories for all items
  const categoryIds = [...new Set(items?.map((item) => item.category_id) || [])];
  let categories: any[] = [];
  if (categoryIds.length > 0) {
    const { data: catData } = await supabase
      .from('menu_categories')
      .select('*')
      .in('id', categoryIds);
    categories = catData || [];
  }
  const categoryMap = new Map(categories.map((cat) => [cat.id, toCamelCase(cat)]));

  // Get modifier groups for all items
  const itemIds = items?.map((item) => item.id) || [];
  let modifierGroups: any[] = [];
  if (itemIds.length > 0) {
    const { data: groupsData } = await supabase
      .from('menu_modifier_groups')
      .select('*')
      .in('menu_item_id', itemIds)
      .order('display_order', { ascending: true });
    modifierGroups = groupsData || [];
  }

  // Get modifiers for all groups
  const groupIds = modifierGroups.map((g) => g.id);
  let modifiers: any[] = [];
  if (groupIds.length > 0) {
    const { data: modData } = await supabase
      .from('menu_modifiers')
      .select('*')
      .in('modifier_group_id', groupIds)
      .order('display_order', { ascending: true });
    modifiers = modData || [];
  }

  // Build nested structure
  const modifiersByGroup = new Map<string, any[]>();
  for (const mod of modifiers) {
    const groupId = mod.modifier_group_id;
    if (!modifiersByGroup.has(groupId)) {
      modifiersByGroup.set(groupId, []);
    }
    modifiersByGroup.get(groupId)!.push(toCamelCase(mod));
  }

  const groupsByItem = new Map<string, any[]>();
  for (const group of modifierGroups) {
    const itemId = group.menu_item_id;
    if (!groupsByItem.has(itemId)) {
      groupsByItem.set(itemId, []);
    }
    const camelGroup = toCamelCase<any>(group);
    camelGroup.modifiers = modifiersByGroup.get(group.id) || [];
    groupsByItem.get(itemId)!.push(camelGroup);
  }

  const result = (items || []).map((item) => {
    const camelItem = toCamelCase<any>(item);
    camelItem.category = categoryMap.get(item.category_id) || null;
    camelItem.modifierGroups = groupsByItem.get(item.id) || [];
    return camelItem;
  });

  return c.json({ data: result });
});

// Get single item
menuRoutes.get('/:businessId/items/:itemId', async (c) => {
  const { businessId, itemId } = c.req.param();

  const { data: item, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('id', itemId)
    .eq('business_id', businessId)
    .single();

  if (error || !item) {
    return c.json({ error: { message: 'Item not found', code: 'NOT_FOUND' } }, 404);
  }

  // Get category
  const { data: category } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('id', item.category_id)
    .single();

  // Get modifier groups
  const { data: modifierGroups } = await supabase
    .from('menu_modifier_groups')
    .select('*')
    .eq('menu_item_id', itemId)
    .order('display_order', { ascending: true });

  // Get modifiers for all groups
  const groupIds = modifierGroups?.map((g) => g.id) || [];
  let modifiers: any[] = [];
  if (groupIds.length > 0) {
    const { data: modData } = await supabase
      .from('menu_modifiers')
      .select('*')
      .in('modifier_group_id', groupIds)
      .order('display_order', { ascending: true });
    modifiers = modData || [];
  }

  // Build modifier structure
  const modifiersByGroup = new Map<string, any[]>();
  for (const mod of modifiers) {
    const groupId = mod.modifier_group_id;
    if (!modifiersByGroup.has(groupId)) {
      modifiersByGroup.set(groupId, []);
    }
    modifiersByGroup.get(groupId)!.push(toCamelCase(mod));
  }

  const camelItem = toCamelCase<any>(item);
  camelItem.category = category ? toCamelCase(category) : null;
  camelItem.modifierGroups = (modifierGroups || []).map((group) => {
    const camelGroup = toCamelCase<any>(group);
    camelGroup.modifiers = modifiersByGroup.get(group.id) || [];
    return camelGroup;
  });

  return c.json({ data: camelItem });
});

// Create item
menuRoutes.post('/:businessId/items', async (c) => {
  const { businessId } = c.req.param();
  const body = await c.req.json();

  const parsed = CreateMenuItemSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify category exists and belongs to business
  const { data: category, error: catError } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('id', parsed.data.categoryId)
    .eq('business_id', businessId)
    .single();

  if (catError || !category) {
    return c.json({ error: { message: 'Category not found', code: 'NOT_FOUND' } }, 404);
  }

  // Get max display order in category
  const { data: maxOrderResult } = await supabase
    .from('menu_items')
    .select('display_order')
    .eq('category_id', parsed.data.categoryId)
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const maxOrder = maxOrderResult?.display_order ?? 0;

  const insertData = {
    business_id: businessId,
    category_id: parsed.data.categoryId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    image_url: parsed.data.imageUrl || null,
    price: parsed.data.price,
    display_order: parsed.data.displayOrder ?? maxOrder + 1,
    is_active: parsed.data.isActive ?? true,
    is_vegetarian: parsed.data.isVegetarian ?? false,
    is_vegan: parsed.data.isVegan ?? false,
    is_gluten_free: parsed.data.isGlutenFree ?? false,
    contains_nuts: parsed.data.containsNuts ?? false,
    contains_dairy: parsed.data.containsDairy ?? false,
    spice_level: parsed.data.spiceLevel || null,
    calories: parsed.data.calories || null,
    prep_time_minutes: parsed.data.prepTimeMinutes || null,
    tags: parsed.data.tags ? JSON.stringify(parsed.data.tags) : null,
  };

  const { data: item, error } = await supabase
    .from('menu_items')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  const camelItem = toCamelCase<any>(item);
  camelItem.category = toCamelCase(category);

  return c.json({ data: camelItem }, 201);
});

// Update item
menuRoutes.put('/:businessId/items/:itemId', async (c) => {
  const { businessId, itemId } = c.req.param();
  const body = await c.req.json();

  const parsed = UpdateMenuItemSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Check if item exists
  const { data: existing, error: existError } = await supabase
    .from('menu_items')
    .select('*')
    .eq('id', itemId)
    .eq('business_id', businessId)
    .single();

  if (existError || !existing) {
    return c.json({ error: { message: 'Item not found', code: 'NOT_FOUND' } }, 404);
  }

  // If changing category, verify new category exists
  if (parsed.data.categoryId) {
    const { data: category, error: catError } = await supabase
      .from('menu_categories')
      .select('id')
      .eq('id', parsed.data.categoryId)
      .eq('business_id', businessId)
      .single();

    if (catError || !category) {
      return c.json({ error: { message: 'Category not found', code: 'NOT_FOUND' } }, 404);
    }
  }

  // Build update data
  const updateData: any = { updated_at: new Date().toISOString() };
  if (parsed.data.categoryId !== undefined) updateData.category_id = parsed.data.categoryId;
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.imageUrl !== undefined) updateData.image_url = parsed.data.imageUrl;
  if (parsed.data.price !== undefined) updateData.price = parsed.data.price;
  if (parsed.data.displayOrder !== undefined) updateData.display_order = parsed.data.displayOrder;
  if (parsed.data.isActive !== undefined) updateData.is_active = parsed.data.isActive;
  if (parsed.data.isVegetarian !== undefined) updateData.is_vegetarian = parsed.data.isVegetarian;
  if (parsed.data.isVegan !== undefined) updateData.is_vegan = parsed.data.isVegan;
  if (parsed.data.isGlutenFree !== undefined) updateData.is_gluten_free = parsed.data.isGlutenFree;
  if (parsed.data.containsNuts !== undefined) updateData.contains_nuts = parsed.data.containsNuts;
  if (parsed.data.containsDairy !== undefined) updateData.contains_dairy = parsed.data.containsDairy;
  if (parsed.data.spiceLevel !== undefined) updateData.spice_level = parsed.data.spiceLevel;
  if (parsed.data.calories !== undefined) updateData.calories = parsed.data.calories;
  if (parsed.data.prepTimeMinutes !== undefined) updateData.prep_time_minutes = parsed.data.prepTimeMinutes;
  if (parsed.data.tags !== undefined) updateData.tags = JSON.stringify(parsed.data.tags);
  if (parsed.data.isAvailable !== undefined) updateData.is_available = parsed.data.isAvailable;
  if (parsed.data.unavailableReason !== undefined) updateData.unavailable_reason = parsed.data.unavailableReason;

  const { data: item, error } = await supabase
    .from('menu_items')
    .update(updateData)
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  // Get category
  const { data: category } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('id', item.category_id)
    .single();

  // Get modifier groups
  const { data: modifierGroups } = await supabase
    .from('menu_modifier_groups')
    .select('*')
    .eq('menu_item_id', itemId)
    .order('display_order', { ascending: true });

  // Get modifiers for all groups
  const groupIds = modifierGroups?.map((g) => g.id) || [];
  let modifiers: any[] = [];
  if (groupIds.length > 0) {
    const { data: modData } = await supabase
      .from('menu_modifiers')
      .select('*')
      .in('modifier_group_id', groupIds)
      .order('display_order', { ascending: true });
    modifiers = modData || [];
  }

  // Build modifier structure
  const modifiersByGroup = new Map<string, any[]>();
  for (const mod of modifiers) {
    const groupId = mod.modifier_group_id;
    if (!modifiersByGroup.has(groupId)) {
      modifiersByGroup.set(groupId, []);
    }
    modifiersByGroup.get(groupId)!.push(toCamelCase(mod));
  }

  const camelItem = toCamelCase<any>(item);
  camelItem.category = category ? toCamelCase(category) : null;
  camelItem.modifierGroups = (modifierGroups || []).map((group) => {
    const camelGroup = toCamelCase<any>(group);
    camelGroup.modifiers = modifiersByGroup.get(group.id) || [];
    return camelGroup;
  });

  return c.json({ data: camelItem });
});

// Delete item
menuRoutes.delete('/:businessId/items/:itemId', async (c) => {
  const { businessId, itemId } = c.req.param();

  // Check if item exists
  const { data: existing, error: existError } = await supabase
    .from('menu_items')
    .select('id')
    .eq('id', itemId)
    .eq('business_id', businessId)
    .single();

  if (existError || !existing) {
    return c.json({ error: { message: 'Item not found', code: 'NOT_FOUND' } }, 404);
  }

  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  return c.body(null, 204);
});

// Reorder items within a category
menuRoutes.put('/:businessId/items/reorder', async (c) => {
  const { businessId } = c.req.param();
  const body = await c.req.json();

  if (!Array.isArray(body.itemIds)) {
    return c.json({ error: { message: 'itemIds array required', code: 'VALIDATION_ERROR' } }, 400);
  }

  const updates = body.itemIds.map((id: string, index: number) =>
    supabase
      .from('menu_items')
      .update({ display_order: index, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', businessId)
  );

  await Promise.all(updates);

  return c.json({ data: { success: true } });
});

// ============================================
// Modifier Groups
// ============================================

// Create modifier group
menuRoutes.post('/:businessId/modifier-groups', async (c) => {
  const { businessId } = c.req.param();
  const body = await c.req.json();

  const parsed = CreateModifierGroupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify item exists and belongs to business
  const { data: item, error: itemError } = await supabase
    .from('menu_items')
    .select('id')
    .eq('id', parsed.data.menuItemId)
    .eq('business_id', businessId)
    .single();

  if (itemError || !item) {
    return c.json({ error: { message: 'Menu item not found', code: 'NOT_FOUND' } }, 404);
  }

  // Get max display order
  const { data: maxOrderResult } = await supabase
    .from('menu_modifier_groups')
    .select('display_order')
    .eq('menu_item_id', parsed.data.menuItemId)
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const maxOrder = maxOrderResult?.display_order ?? 0;

  const insertData = {
    menu_item_id: parsed.data.menuItemId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    display_order: parsed.data.displayOrder ?? maxOrder + 1,
    is_required: parsed.data.isRequired ?? false,
    min_selections: parsed.data.minSelections ?? 0,
    max_selections: parsed.data.maxSelections ?? 1,
  };

  const { data: group, error } = await supabase
    .from('menu_modifier_groups')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  const camelGroup = toCamelCase<any>(group);
  camelGroup.modifiers = [];

  return c.json({ data: camelGroup }, 201);
});

// Update modifier group
menuRoutes.put('/:businessId/modifier-groups/:groupId', async (c) => {
  const { businessId, groupId } = c.req.param();
  const body = await c.req.json();

  const parsed = UpdateModifierGroupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify group exists and belongs to business via menu item
  const { data: existing, error: existError } = await supabase
    .from('menu_modifier_groups')
    .select('*, menu_items!inner(business_id)')
    .eq('id', groupId)
    .single();

  if (existError || !existing || (existing.menu_items as any).business_id !== businessId) {
    return c.json({ error: { message: 'Modifier group not found', code: 'NOT_FOUND' } }, 404);
  }

  // Build update data
  const updateData: any = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.displayOrder !== undefined) updateData.display_order = parsed.data.displayOrder;
  if (parsed.data.isRequired !== undefined) updateData.is_required = parsed.data.isRequired;
  if (parsed.data.minSelections !== undefined) updateData.min_selections = parsed.data.minSelections;
  if (parsed.data.maxSelections !== undefined) updateData.max_selections = parsed.data.maxSelections;

  const { data: group, error } = await supabase
    .from('menu_modifier_groups')
    .update(updateData)
    .eq('id', groupId)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  // Get modifiers for this group
  const { data: modifiers } = await supabase
    .from('menu_modifiers')
    .select('*')
    .eq('modifier_group_id', groupId)
    .order('display_order', { ascending: true });

  const camelGroup = toCamelCase<any>(group);
  camelGroup.modifiers = toCamelCase(modifiers || []);

  return c.json({ data: camelGroup });
});

// Delete modifier group
menuRoutes.delete('/:businessId/modifier-groups/:groupId', async (c) => {
  const { businessId, groupId } = c.req.param();

  // Verify group exists and belongs to business via menu item
  const { data: existing, error: existError } = await supabase
    .from('menu_modifier_groups')
    .select('*, menu_items!inner(business_id)')
    .eq('id', groupId)
    .single();

  if (existError || !existing || (existing.menu_items as any).business_id !== businessId) {
    return c.json({ error: { message: 'Modifier group not found', code: 'NOT_FOUND' } }, 404);
  }

  const { error } = await supabase
    .from('menu_modifier_groups')
    .delete()
    .eq('id', groupId);

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  return c.body(null, 204);
});

// ============================================
// Modifiers
// ============================================

// Create modifier
menuRoutes.post('/:businessId/modifiers', async (c) => {
  const { businessId } = c.req.param();
  const body = await c.req.json();

  const parsed = CreateModifierSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify group exists and belongs to business via menu item
  const { data: group, error: groupError } = await supabase
    .from('menu_modifier_groups')
    .select('*, menu_items!inner(business_id)')
    .eq('id', parsed.data.modifierGroupId)
    .single();

  if (groupError || !group || (group.menu_items as any).business_id !== businessId) {
    return c.json({ error: { message: 'Modifier group not found', code: 'NOT_FOUND' } }, 404);
  }

  // Get max display order
  const { data: maxOrderResult } = await supabase
    .from('menu_modifiers')
    .select('display_order')
    .eq('modifier_group_id', parsed.data.modifierGroupId)
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const maxOrder = maxOrderResult?.display_order ?? 0;

  const insertData = {
    modifier_group_id: parsed.data.modifierGroupId,
    name: parsed.data.name,
    price_adjustment: parsed.data.priceAdjustment ?? 0,
    display_order: parsed.data.displayOrder ?? maxOrder + 1,
    is_default: parsed.data.isDefault ?? false,
    is_available: parsed.data.isAvailable ?? true,
  };

  const { data: modifier, error } = await supabase
    .from('menu_modifiers')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  return c.json({ data: toCamelCase(modifier) }, 201);
});

// Update modifier
menuRoutes.put('/:businessId/modifiers/:modifierId', async (c) => {
  const { businessId, modifierId } = c.req.param();
  const body = await c.req.json();

  const parsed = UpdateModifierSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.issues } }, 400);
  }

  // Verify modifier exists and belongs to business
  const { data: existing, error: existError } = await supabase
    .from('menu_modifiers')
    .select('*, menu_modifier_groups!inner(menu_item_id, menu_items:menu_items!inner(business_id))')
    .eq('id', modifierId)
    .single();

  if (existError || !existing) {
    return c.json({ error: { message: 'Modifier not found', code: 'NOT_FOUND' } }, 404);
  }

  const menuModifierGroups = existing.menu_modifier_groups as any;
  if (menuModifierGroups?.menu_items?.business_id !== businessId) {
    return c.json({ error: { message: 'Modifier not found', code: 'NOT_FOUND' } }, 404);
  }

  // Build update data
  const updateData: any = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.priceAdjustment !== undefined) updateData.price_adjustment = parsed.data.priceAdjustment;
  if (parsed.data.displayOrder !== undefined) updateData.display_order = parsed.data.displayOrder;
  if (parsed.data.isDefault !== undefined) updateData.is_default = parsed.data.isDefault;
  if (parsed.data.isAvailable !== undefined) updateData.is_available = parsed.data.isAvailable;

  const { data: modifier, error } = await supabase
    .from('menu_modifiers')
    .update(updateData)
    .eq('id', modifierId)
    .select()
    .single();

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  return c.json({ data: toCamelCase(modifier) });
});

// Delete modifier
menuRoutes.delete('/:businessId/modifiers/:modifierId', async (c) => {
  const { businessId, modifierId } = c.req.param();

  // Verify modifier exists and belongs to business
  const { data: existing, error: existError } = await supabase
    .from('menu_modifiers')
    .select('*, menu_modifier_groups!inner(menu_item_id, menu_items:menu_items!inner(business_id))')
    .eq('id', modifierId)
    .single();

  if (existError || !existing) {
    return c.json({ error: { message: 'Modifier not found', code: 'NOT_FOUND' } }, 404);
  }

  const menuModifierGroups = existing.menu_modifier_groups as any;
  if (menuModifierGroups?.menu_items?.business_id !== businessId) {
    return c.json({ error: { message: 'Modifier not found', code: 'NOT_FOUND' } }, 404);
  }

  const { error } = await supabase
    .from('menu_modifiers')
    .delete()
    .eq('id', modifierId);

  if (error) {
    return c.json({ error: { message: error.message, code: 'DB_ERROR' } }, 500);
  }

  return c.body(null, 204);
});

// ============================================
// Public Menu (for customer-facing views)
// ============================================

// Get full menu for a business (public)
menuRoutes.get('/:businessId/public', async (c) => {
  const { businessId } = c.req.param();

  const { data: business, error: bizError } = await supabase
    .from('business_accounts')
    .select('id, business_name, is_active')
    .eq('id', businessId)
    .single();

  if (bizError || !business || !business.is_active) {
    return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
  }

  // Get active categories
  const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (catError) {
    return c.json({ error: { message: catError.message, code: 'DB_ERROR' } }, 500);
  }

  // Get active items for all categories
  const categoryIds = categories?.map((cat) => cat.id) || [];

  let items: any[] = [];
  if (categoryIds.length > 0) {
    const { data: itemsData, error: itemsError } = await supabase
      .from('menu_items')
      .select('*')
      .in('category_id', categoryIds)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (itemsError) {
      return c.json({ error: { message: itemsError.message, code: 'DB_ERROR' } }, 500);
    }
    items = itemsData || [];
  }

  // Get modifier groups for all items
  const itemIds = items.map((item) => item.id);
  let modifierGroups: any[] = [];
  if (itemIds.length > 0) {
    const { data: groupsData, error: groupsError } = await supabase
      .from('menu_modifier_groups')
      .select('*')
      .in('menu_item_id', itemIds)
      .order('display_order', { ascending: true });

    if (groupsError) {
      return c.json({ error: { message: groupsError.message, code: 'DB_ERROR' } }, 500);
    }
    modifierGroups = groupsData || [];
  }

  // Get available modifiers for all modifier groups
  const groupIds = modifierGroups.map((g) => g.id);
  let modifiers: any[] = [];
  if (groupIds.length > 0) {
    const { data: modifiersData, error: modifiersError } = await supabase
      .from('menu_modifiers')
      .select('*')
      .in('modifier_group_id', groupIds)
      .eq('is_available', true)
      .order('display_order', { ascending: true });

    if (modifiersError) {
      return c.json({ error: { message: modifiersError.message, code: 'DB_ERROR' } }, 500);
    }
    modifiers = modifiersData || [];
  }

  // Assemble the nested structure
  const modifiersByGroup = new Map<string, any[]>();
  for (const mod of modifiers) {
    const groupId = mod.modifier_group_id;
    if (!modifiersByGroup.has(groupId)) {
      modifiersByGroup.set(groupId, []);
    }
    modifiersByGroup.get(groupId)!.push(toCamelCase(mod));
  }

  const groupsByItem = new Map<string, any[]>();
  for (const group of modifierGroups) {
    const itemId = group.menu_item_id;
    if (!groupsByItem.has(itemId)) {
      groupsByItem.set(itemId, []);
    }
    const camelGroup = toCamelCase<any>(group);
    camelGroup.modifiers = modifiersByGroup.get(group.id) || [];
    groupsByItem.get(itemId)!.push(camelGroup);
  }

  const itemsByCategory = new Map<string, any[]>();
  for (const item of items) {
    const catId = item.category_id;
    if (!itemsByCategory.has(catId)) {
      itemsByCategory.set(catId, []);
    }
    const camelItem = toCamelCase<any>(item);
    camelItem.modifierGroups = groupsByItem.get(item.id) || [];
    itemsByCategory.get(catId)!.push(camelItem);
  }

  const resultCategories = (categories || []).map((cat) => {
    const camelCat = toCamelCase<any>(cat);
    camelCat.items = itemsByCategory.get(cat.id) || [];
    return camelCat;
  });

  return c.json({
    data: {
      businessId: business.id,
      businessName: business.business_name,
      categories: resultCategories,
    },
  });
});

export { menuRoutes };
