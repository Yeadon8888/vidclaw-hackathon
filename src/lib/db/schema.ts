import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── Enums ───

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const taskTypeEnum = pgEnum("task_type", ["theme", "remix", "url"]);
export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "analyzing",
  "generating",
  "polling",
  "done",
  "failed",
]);
export const creditTxnTypeEnum = pgEnum("credit_txn_type", [
  "grant",    // admin 充值
  "consume",  // 生成消费
  "refund",   // 退款
  "adjust",   // 管理员手动调整
]);
export const assetTypeEnum = pgEnum("asset_type", ["image", "video"]);

// ─── Users ───

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Supabase Auth user ID — links to auth.users */
  authId: uuid("auth_id").unique().notNull(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 100 }),
  role: userRoleEnum("role").default("user").notNull(),
  status: userStatusEnum("status").default("active").notNull(),
  credits: integer("credits").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Models (可用视频模型配置) ───

export const models = pgTable("models", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 50 }).unique().notNull(),
  provider: varchar("provider", { length: 50 }).notNull(), // "plato" | "veo" etc.
  creditsPerGen: integer("credits_per_gen").default(10).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  /** Per-model API key (overrides env `VIDEO_API_KEY` if set) */
  apiKey: text("api_key"),
  /** Per-model API base URL (overrides env `VIDEO_BASE_URL` if set) */
  baseUrl: text("base_url"),
  defaultParams: jsonb("default_params").$type<{
    orientation?: "portrait" | "landscape";
    duration?: number;
  }>().default({}),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Tasks (视频生成任务) ───

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: taskTypeEnum("type").notNull(),
  status: taskStatusEnum("status").default("pending").notNull(),
  modelId: uuid("model_id").references(() => models.id),
  inputText: text("input_text"),
  videoSourceUrl: text("video_source_url"),
  soraPrompt: text("sora_prompt"),
  scriptJson: jsonb("script_json"),
  resultUrls: jsonb("result_urls").$type<string[]>().default([]),
  creditsCost: integer("credits_cost").default(0).notNull(),
  paramsJson: jsonb("params_json").$type<{
    orientation: string;
    duration: number;
    count: number;
    platform: string;
    model: string;
  }>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── Task Items (单个视频生成子任务) ───

export const taskItems = pgTable("task_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  providerTaskId: varchar("provider_task_id", { length: 255 }),
  status: varchar("status", { length: 50 }).default("PENDING").notNull(),
  progress: varchar("progress", { length: 20 }).default("0%"),
  resultUrl: text("result_url"),
  failReason: text("fail_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── Credit Transactions (积分流水) ───

export const creditTxns = pgTable("credit_txns", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: creditTxnTypeEnum("type").notNull(),
  amount: integer("amount").notNull(), // 正数=充值 负数=消费
  reason: text("reason"),
  modelId: uuid("model_id").references(() => models.id),
  taskId: uuid("task_id").references(() => tasks.id),
  adminId: uuid("admin_id").references(() => users.id),
  balanceAfter: integer("balance_after").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── User Assets (用户上传的参考图/视频) ───

export const userAssets = pgTable("user_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: assetTypeEnum("type").notNull(),
  r2Key: text("r2_key").notNull(),
  url: text("url").notNull(),
  filename: varchar("filename", { length: 255 }),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── System Config (键值对系统配置) ───

export const systemConfig = pgTable("system_config", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Type exports ───

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskItem = typeof taskItems.$inferSelect;
export type CreditTxn = typeof creditTxns.$inferSelect;
export type UserAsset = typeof userAssets.$inferSelect;
export type SystemConfigRow = typeof systemConfig.$inferSelect;
