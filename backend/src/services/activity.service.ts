import { db } from "../db";
import { activityLogs } from "../db/schema";

export async function logActivity(params: {
  userId: string;
  cityId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(activityLogs).values({
    userId: params.userId,
    cityId: params.cityId ?? undefined,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    metadata: params.metadata,
  });
}
