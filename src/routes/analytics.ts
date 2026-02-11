import { Hono } from 'hono';
import { supabase } from '../supabase';

const analyticsRouter = new Hono();

// Helper to get date ranges
function getDateRanges() {
  const now = new Date();

  // Today (start and end)
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  // This week (start from Monday)
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);

  // This month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);

  // 30 days ago
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    now,
    todayStart,
    todayEnd,
    weekStart,
    monthStart,
    thirtyDaysAgo,
  };
}

// Helper to convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Helper to convert object keys from snake_case to camelCase
function convertKeysToCamel<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const camelKey = snakeToCamel(key);
    result[camelKey] = obj[key];
  }
  return result as T;
}

// ============================================
// Dashboard - Comprehensive analytics summary
// ============================================

analyticsRouter.get('/:businessId/dashboard', async (c) => {
  const { businessId } = c.req.param();

  const { todayStart, todayEnd, weekStart, monthStart, thirtyDaysAgo, now } = getDateRanges();

  // Verify business exists
  const { data: business, error: businessError } = await supabase
    .from('business_accounts')
    .select('id')
    .eq('id', businessId)
    .single();

  if (businessError || !business) {
    return c.json({ error: { message: 'Business not found', code: 'NOT_FOUND' } }, 404);
  }

  // Revenue queries - fetch orders for different time periods
  const [
    todayOrdersResult,
    weekOrdersResult,
    monthOrdersResult,
    recentOrdersResult,
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('total_amount')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString()),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('created_at', weekStart.toISOString()),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('created_at', monthStart.toISOString()),
    // Last 30 days for trend
    supabase
      .from('orders')
      .select('total_amount, created_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('created_at', thirtyDaysAgo.toISOString()),
  ]);

  const todayOrders = todayOrdersResult.data || [];
  const weekOrders = weekOrdersResult.data || [];
  const monthOrders = monthOrdersResult.data || [];
  const recentOrders = recentOrdersResult.data || [];

  // Calculate revenue trend by day
  const trendMap = new Map<string, { revenue: number; orders: number }>();
  for (let i = 0; i < 30; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0] as string;
    trendMap.set(dateStr, { revenue: 0, orders: 0 });
  }

  for (const order of recentOrders) {
    const dateStr = new Date(order.created_at).toISOString().split('T')[0] as string;
    const existing = trendMap.get(dateStr);
    if (existing) {
      existing.revenue += order.total_amount;
      existing.orders += 1;
    }
  }

  const trend = Array.from(trendMap.entries())
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      orders: data.orders,
      avgOrderValue: data.orders > 0 ? data.revenue / data.orders : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Order queries - counts and aggregations
  const [
    todayOrderCountResult,
    weekOrderCountResult,
    monthOrderCountResult,
    monthOrdersForStatusResult,
    allTodayOrdersResult,
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString()),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', weekStart.toISOString()),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('orders')
      .select('status, order_type')
      .eq('business_id', businessId)
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('orders')
      .select('created_at, total_amount, status')
      .eq('business_id', businessId)
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString()),
  ]);

  const todayOrderCount = todayOrderCountResult.count || 0;
  const weekOrderCount = weekOrderCountResult.count || 0;
  const monthOrderCount = monthOrderCountResult.count || 0;
  const monthOrdersForStatus = monthOrdersForStatusResult.data || [];
  const allTodayOrders = allTodayOrdersResult.data || [];

  // Aggregate by status and type in JavaScript
  const ordersByStatusMap = new Map<string, number>();
  const ordersByTypeMap = new Map<string, number>();

  for (const order of monthOrdersForStatus) {
    ordersByStatusMap.set(order.status, (ordersByStatusMap.get(order.status) || 0) + 1);
    ordersByTypeMap.set(order.order_type, (ordersByTypeMap.get(order.order_type) || 0) + 1);
  }

  const ordersByStatus = Object.fromEntries(ordersByStatusMap);
  const ordersByType = Object.fromEntries(ordersByTypeMap);

  // Calculate orders by hour
  const byHourMap = new Map<number, { count: number; revenue: number }>();
  for (let h = 0; h < 24; h++) {
    byHourMap.set(h, { count: 0, revenue: 0 });
  }

  for (const order of allTodayOrders) {
    const hour = new Date(order.created_at).getHours();
    const existing = byHourMap.get(hour);
    if (existing) {
      existing.count += 1;
      if (order.status === 'completed') {
        existing.revenue += order.total_amount;
      }
    }
  }

  const byHour = Array.from(byHourMap.entries()).map(([hour, data]) => ({
    hour,
    count: data.count,
    revenue: data.revenue,
  }));

  // Customer queries
  const [
    totalCustomersResult,
    newCustomersThisMonthResult,
    activeCustomersResult,
    topSpendersResult,
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('last_visit_at', thirtyDaysAgo.toISOString()),
    supabase
      .from('customers')
      .select('id, first_name, last_name, total_spent, total_visits, average_spend, last_visit_at')
      .eq('business_id', businessId)
      .order('total_spent', { ascending: false })
      .limit(5),
  ]);

  const totalCustomers = totalCustomersResult.count || 0;
  const newCustomersThisMonth = newCustomersThisMonthResult.count || 0;
  const activeCustomers = activeCustomersResult.count || 0;
  const topSpendersData = topSpendersResult.data || [];

  const topSpenders = topSpendersData.map(customer => ({
    id: customer.id,
    name: `${customer.first_name} ${customer.last_name}`,
    totalSpent: customer.total_spent,
    visitCount: customer.total_visits,
    avgSpend: customer.average_spend,
    lastVisit: customer.last_visit_at || null,
  }));

  // Menu queries - get popular items from order items
  // First get completed orders for this business in the month
  const { data: completedOrdersData } = await supabase
    .from('orders')
    .select('id')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .gte('created_at', monthStart.toISOString());

  const completedOrderIds = (completedOrdersData || []).map(o => o.id);

  let orderItems: Array<{
    menu_item_id: string | null;
    item_name: string;
    item_price: number;
    quantity: number;
    total_price: number;
  }> = [];

  if (completedOrderIds.length > 0) {
    const { data: orderItemsData } = await supabase
      .from('order_items')
      .select('menu_item_id, item_name, item_price, quantity, total_price')
      .in('order_id', completedOrderIds);
    orderItems = orderItemsData || [];
  }

  // Aggregate by menu item
  const itemAggregates = new Map<string, {
    id: string;
    name: string;
    price: number;
    quantitySold: number;
    revenue: number;
  }>();

  for (const item of orderItems) {
    if (item.menu_item_id) {
      const existing = itemAggregates.get(item.menu_item_id);
      if (existing) {
        existing.quantitySold += item.quantity;
        existing.revenue += item.total_price;
      } else {
        itemAggregates.set(item.menu_item_id, {
          id: item.menu_item_id,
          name: item.item_name,
          price: item.item_price,
          quantitySold: item.quantity,
          revenue: item.total_price,
        });
      }
    }
  }

  // Get menu items with category info
  const menuItemIds = Array.from(itemAggregates.keys());
  let menuItemCategoryMap = new Map<string, string>();

  if (menuItemIds.length > 0) {
    const { data: menuItemsData } = await supabase
      .from('menu_items')
      .select('id, category_id')
      .in('id', menuItemIds);

    if (menuItemsData && menuItemsData.length > 0) {
      const categoryIds = [...new Set(menuItemsData.map(m => m.category_id))];
      const { data: categoriesData } = await supabase
        .from('menu_categories')
        .select('id, name')
        .in('id', categoryIds);

      const categoryNameMap = new Map((categoriesData || []).map(c => [c.id, c.name]));
      menuItemCategoryMap = new Map(menuItemsData.map(m => [m.id, categoryNameMap.get(m.category_id) || 'Unknown']));
    }
  }

  const popularItems = Array.from(itemAggregates.values())
    .map(item => ({
      ...item,
      categoryName: menuItemCategoryMap.get(item.id) || 'Unknown',
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 10);

  // Category performance
  const { data: categoriesData } = await supabase
    .from('menu_categories')
    .select('id, name')
    .eq('business_id', businessId);

  const categories = categoriesData || [];

  // Get all menu items for these categories
  const categoryIds = categories.map(c => c.id);
  let categoryItemsMap = new Map<string, Array<{ id: string; price: number; is_active: boolean }>>();

  if (categoryIds.length > 0) {
    const { data: allMenuItems } = await supabase
      .from('menu_items')
      .select('id, category_id, price, is_active')
      .in('category_id', categoryIds);

    for (const item of allMenuItems || []) {
      const items = categoryItemsMap.get(item.category_id) || [];
      items.push({ id: item.id, price: item.price, is_active: item.is_active });
      categoryItemsMap.set(item.category_id, items);
    }
  }

  const categoryPerformance = categories.map(cat => {
    const catItems = categoryItemsMap.get(cat.id) || [];
    const categoryItemIds = catItems.map(i => i.id);
    let totalRevenue = 0;
    let totalQuantitySold = 0;

    for (const item of orderItems) {
      if (item.menu_item_id && categoryItemIds.includes(item.menu_item_id)) {
        totalRevenue += item.total_price;
        totalQuantitySold += item.quantity;
      }
    }

    const prices = catItems.map(i => i.price);
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

    return {
      id: cat.id,
      name: cat.name,
      itemCount: catItems.length,
      activeItemCount: catItems.filter(i => i.is_active).length,
      totalRevenue,
      avgPrice,
      totalQuantitySold,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Reservation queries
  const [
    upcomingReservationsResult,
    todayReservationsResult,
    monthReservationsResult,
  ] = await Promise.all([
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .in('status', ['pending', 'confirmed'])
      .gte('reservation_date', todayStart.toISOString()),
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('reservation_date', todayStart.toISOString())
      .lte('reservation_date', todayEnd.toISOString()),
    supabase
      .from('reservations')
      .select('status, party_size')
      .eq('business_id', businessId)
      .gte('created_at', monthStart.toISOString()),
  ]);

  const upcomingReservations = upcomingReservationsResult.count || 0;
  const todayReservations = todayReservationsResult.count || 0;
  const monthReservations = monthReservationsResult.data || [];

  const noShowCount = monthReservations.filter(r => r.status === 'no_show').length;
  const noShowRate = monthReservations.length > 0 ? (noShowCount / monthReservations.length) * 100 : 0;
  const avgPartySize = monthReservations.length > 0
    ? monthReservations.reduce((sum, r) => sum + r.party_size, 0) / monthReservations.length
    : 0;

  // Build response
  const dashboard = {
    revenue: {
      today: todayOrders.reduce((sum, o) => sum + o.total_amount, 0),
      thisWeek: weekOrders.reduce((sum, o) => sum + o.total_amount, 0),
      thisMonth: monthOrders.reduce((sum, o) => sum + o.total_amount, 0),
      trend,
    },
    orders: {
      today: todayOrderCount,
      thisWeek: weekOrderCount,
      thisMonth: monthOrderCount,
      byStatus: ordersByStatus,
      byType: ordersByType,
      byHour,
    },
    customers: {
      total: totalCustomers,
      newThisMonth: newCustomersThisMonth,
      active: activeCustomers,
      topSpenders,
    },
    menu: {
      popularItems,
      categoryPerformance,
    },
    reservations: {
      upcoming: upcomingReservations,
      today: todayReservations,
      noShowRate,
      avgPartySize,
    },
  };

  return c.json({ data: dashboard });
});

// ============================================
// Revenue Analytics
// ============================================

analyticsRouter.get('/:businessId/revenue', async (c) => {
  const { businessId } = c.req.param();
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  // Build query
  let query = supabase
    .from('orders')
    .select('id, total_amount, tax_amount, tip_amount, discount_amount, order_type, payment_status, status')
    .eq('business_id', businessId);

  if (startDate) {
    query = query.gte('created_at', new Date(startDate).toISOString());
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    query = query.lte('created_at', end.toISOString());
  }

  const { data: orders, error } = await query;

  if (error) {
    return c.json({ error: { message: 'Failed to fetch orders', code: 'DATABASE_ERROR' } }, 500);
  }

  const ordersList = orders || [];

  // Calculate revenue metrics
  let totalRevenue = 0;
  let totalTax = 0;
  let totalTips = 0;
  let totalDiscounts = 0;
  let paidAmount = 0;
  let pendingAmount = 0;
  let refundedAmount = 0;

  const byOrderType: Record<string, { count: number; revenue: number }> = {};

  for (const order of ordersList) {
    if (order.status === 'completed') {
      totalRevenue += order.total_amount;
      totalTax += order.tax_amount;
      totalTips += order.tip_amount;
      totalDiscounts += order.discount_amount;
    }

    if (order.payment_status === 'paid') {
      paidAmount += order.total_amount;
    } else if (order.payment_status === 'pending') {
      pendingAmount += order.total_amount;
    } else if (order.payment_status === 'refunded') {
      refundedAmount += order.total_amount;
    }

    if (!byOrderType[order.order_type]) {
      byOrderType[order.order_type] = { count: 0, revenue: 0 };
    }
    const orderTypeData = byOrderType[order.order_type]!;
    orderTypeData.count += 1;
    if (order.status === 'completed') {
      orderTypeData.revenue += order.total_amount;
    }
  }

  const completedOrders = ordersList.filter(o => o.status === 'completed').length;
  const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

  return c.json({
    data: {
      totalRevenue,
      avgOrderValue,
      totalOrders: ordersList.length,
      totalTax,
      totalTips,
      totalDiscounts,
      paidAmount,
      pendingAmount,
      refundedAmount,
      byOrderType,
    },
  });
});

// ============================================
// Order Analytics
// ============================================

analyticsRouter.get('/:businessId/orders', async (c) => {
  const { businessId } = c.req.param();
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  // Build query
  let query = supabase
    .from('orders')
    .select('status, order_type, source')
    .eq('business_id', businessId);

  if (startDate) {
    query = query.gte('created_at', new Date(startDate).toISOString());
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    query = query.lte('created_at', end.toISOString());
  }

  const { data: orders, error, count } = await query;

  if (error) {
    return c.json({ error: { message: 'Failed to fetch orders', code: 'DATABASE_ERROR' } }, 500);
  }

  const ordersList = orders || [];
  const totalOrders = ordersList.length;

  // Aggregate by status, type, and source in JavaScript
  const byStatusMap = new Map<string, number>();
  const byTypeMap = new Map<string, number>();
  const bySourceMap = new Map<string, number>();

  for (const order of ordersList) {
    byStatusMap.set(order.status, (byStatusMap.get(order.status) || 0) + 1);
    byTypeMap.set(order.order_type, (byTypeMap.get(order.order_type) || 0) + 1);
    if (order.source) {
      bySourceMap.set(order.source, (bySourceMap.get(order.source) || 0) + 1);
    }
  }

  const completedOrders = ordersList.filter(o => o.status === 'completed').length;
  const cancelledOrders = ordersList.filter(o => o.status === 'cancelled').length;
  const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

  return c.json({
    data: {
      totalOrders,
      byStatus: Object.fromEntries(byStatusMap),
      byType: Object.fromEntries(byTypeMap),
      bySource: Object.fromEntries(bySourceMap),
      completedOrders,
      cancelledOrders,
      cancellationRate,
    },
  });
});

// ============================================
// Customer Analytics
// ============================================

analyticsRouter.get('/:businessId/customers', async (c) => {
  const { businessId } = c.req.param();

  const { monthStart, thirtyDaysAgo } = getDateRanges();

  // Get customer aggregations
  const [
    totalCustomersResult,
    newThisMonthResult,
    activeCustomersResult,
    repeatCustomersResult,
    allCustomersResult,
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('last_visit_at', thirtyDaysAgo.toISOString()),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gt('total_visits', 1),
    supabase
      .from('customers')
      .select('total_spent, total_visits, source')
      .eq('business_id', businessId),
  ]);

  const totalCustomers = totalCustomersResult.count || 0;
  const newThisMonth = newThisMonthResult.count || 0;
  const activeCustomers = activeCustomersResult.count || 0;
  const repeatCustomers = repeatCustomersResult.count || 0;
  const allCustomers = allCustomersResult.data || [];

  const totalSpent = allCustomers.reduce((sum, c) => sum + c.total_spent, 0);
  const totalVisits = allCustomers.reduce((sum, c) => sum + c.total_visits, 0);

  // Aggregate by source in JavaScript
  const bySourceMap = new Map<string, number>();
  for (const customer of allCustomers) {
    if (customer.source) {
      bySourceMap.set(customer.source, (bySourceMap.get(customer.source) || 0) + 1);
    }
  }

  const repeatCustomerRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
  const avgLifetimeValue = totalCustomers > 0 ? totalSpent / totalCustomers : 0;
  const avgOrdersPerCustomer = totalCustomers > 0 ? totalVisits / totalCustomers : 0;

  return c.json({
    data: {
      totalCustomers,
      newThisMonth,
      activeCustomers,
      repeatCustomerRate,
      avgLifetimeValue,
      avgOrdersPerCustomer,
      bySource: Object.fromEntries(bySourceMap),
    },
  });
});

// ============================================
// Menu Analytics
// ============================================

analyticsRouter.get('/:businessId/menu', async (c) => {
  const { businessId } = c.req.param();
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  // Build date filter for orders
  let ordersQuery = supabase
    .from('orders')
    .select('id')
    .eq('business_id', businessId)
    .eq('status', 'completed');

  if (startDate) {
    ordersQuery = ordersQuery.gte('created_at', new Date(startDate).toISOString());
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    ordersQuery = ordersQuery.lte('created_at', end.toISOString());
  }

  const { data: completedOrdersData } = await ordersQuery;
  const completedOrderIds = (completedOrdersData || []).map(o => o.id);

  let orderItems: Array<{
    menu_item_id: string | null;
    item_name: string;
    item_price: number;
    quantity: number;
    total_price: number;
  }> = [];

  if (completedOrderIds.length > 0) {
    const { data: orderItemsData } = await supabase
      .from('order_items')
      .select('menu_item_id, item_name, item_price, quantity, total_price')
      .in('order_id', completedOrderIds);
    orderItems = orderItemsData || [];
  }

  // Aggregate by menu item
  const itemAggregates = new Map<string, {
    id: string;
    name: string;
    price: number;
    quantitySold: number;
    revenue: number;
  }>();

  for (const item of orderItems) {
    if (item.menu_item_id) {
      const existing = itemAggregates.get(item.menu_item_id);
      if (existing) {
        existing.quantitySold += item.quantity;
        existing.revenue += item.total_price;
      } else {
        itemAggregates.set(item.menu_item_id, {
          id: item.menu_item_id,
          name: item.item_name,
          price: item.item_price,
          quantitySold: item.quantity,
          revenue: item.total_price,
        });
      }
    }
  }

  // Get menu items with category info
  const menuItemIds = Array.from(itemAggregates.keys());
  let menuItemCategoryMap = new Map<string, string>();

  if (menuItemIds.length > 0) {
    const { data: menuItemsData } = await supabase
      .from('menu_items')
      .select('id, category_id')
      .in('id', menuItemIds);

    if (menuItemsData && menuItemsData.length > 0) {
      const categoryIds = [...new Set(menuItemsData.map(m => m.category_id))];
      const { data: categoriesData } = await supabase
        .from('menu_categories')
        .select('id, name')
        .in('id', categoryIds);

      const categoryNameMap = new Map((categoriesData || []).map(c => [c.id, c.name]));
      menuItemCategoryMap = new Map(menuItemsData.map(m => [m.id, categoryNameMap.get(m.category_id) || 'Unknown']));
    }
  }

  const popularItems = Array.from(itemAggregates.values())
    .map(item => ({
      ...item,
      categoryName: menuItemCategoryMap.get(item.id) || 'Unknown',
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 20);

  // Category performance
  const { data: categoriesData } = await supabase
    .from('menu_categories')
    .select('id, name')
    .eq('business_id', businessId);

  const categories = categoriesData || [];

  // Get all menu items for these categories
  const categoryIds = categories.map(c => c.id);
  let categoryItemsMap = new Map<string, Array<{ id: string; price: number; is_active: boolean }>>();

  if (categoryIds.length > 0) {
    const { data: allMenuItems } = await supabase
      .from('menu_items')
      .select('id, category_id, price, is_active')
      .in('category_id', categoryIds);

    for (const item of allMenuItems || []) {
      const items = categoryItemsMap.get(item.category_id) || [];
      items.push({ id: item.id, price: item.price, is_active: item.is_active });
      categoryItemsMap.set(item.category_id, items);
    }
  }

  const categoryPerformance = categories.map(cat => {
    const catItems = categoryItemsMap.get(cat.id) || [];
    const categoryItemIds = catItems.map(i => i.id);
    let totalRevenue = 0;
    let totalQuantitySold = 0;

    for (const item of orderItems) {
      if (item.menu_item_id && categoryItemIds.includes(item.menu_item_id)) {
        totalRevenue += item.total_price;
        totalQuantitySold += item.quantity;
      }
    }

    const prices = catItems.map(i => i.price);
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

    return {
      id: cat.id,
      name: cat.name,
      itemCount: catItems.length,
      activeItemCount: catItems.filter(i => i.is_active).length,
      totalRevenue,
      avgPrice,
      totalQuantitySold,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  return c.json({
    data: {
      popularItems,
      categoryPerformance,
    },
  });
});

// ============================================
// Reservation Analytics
// ============================================

analyticsRouter.get('/:businessId/reservations', async (c) => {
  const { businessId } = c.req.param();
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  // Build query
  let query = supabase
    .from('reservations')
    .select('status, party_size, source')
    .eq('business_id', businessId);

  if (startDate) {
    query = query.gte('created_at', new Date(startDate).toISOString());
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    query = query.lte('created_at', end.toISOString());
  }

  const { data: reservations, error } = await query;

  if (error) {
    return c.json({ error: { message: 'Failed to fetch reservations', code: 'DATABASE_ERROR' } }, 500);
  }

  const reservationsList = reservations || [];
  const totalReservations = reservationsList.length;

  // Aggregate by status and source in JavaScript
  const byStatusMap = new Map<string, number>();
  const bySourceMap = new Map<string, number>();

  for (const reservation of reservationsList) {
    byStatusMap.set(reservation.status, (byStatusMap.get(reservation.status) || 0) + 1);
    if (reservation.source) {
      bySourceMap.set(reservation.source, (bySourceMap.get(reservation.source) || 0) + 1);
    }
  }

  const noShowCount = reservationsList.filter(r => r.status === 'no_show').length;
  const cancelledCount = reservationsList.filter(r => r.status === 'cancelled').length;

  const noShowRate = totalReservations > 0 ? (noShowCount / totalReservations) * 100 : 0;
  const cancellationRate = totalReservations > 0 ? (cancelledCount / totalReservations) * 100 : 0;
  const avgPartySize = reservationsList.length > 0
    ? reservationsList.reduce((sum, r) => sum + r.party_size, 0) / reservationsList.length
    : 0;

  return c.json({
    data: {
      totalReservations,
      byStatus: Object.fromEntries(byStatusMap),
      noShowRate,
      cancellationRate,
      avgPartySize,
      bySource: Object.fromEntries(bySourceMap),
    },
  });
});

export { analyticsRouter };
