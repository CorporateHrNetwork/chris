const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(requireAuth);
router.use(requirePermission("reports.view"));

function clean(value) {
  return String(value || "").trim();
}

router.get("/", async (req, res) => {
  const organizationId = req.auth.organizationId;
  const q = clean(req.query.q);
  const action = clean(req.query.action);
  const entityType = clean(req.query.entityType);
  const from = clean(req.query.from);
  const to = clean(req.query.to);
  const take = Math.min(Math.max(Number(req.query.limit) || 250, 1), 1000);

  const where = { organizationId };
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (entityType) where.entityType = { contains: entityType, mode: "insensitive" };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { reason: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.organizationAudit.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
  });

  const actorIds = [...new Set(rows.map((row) => row.actorUserId).filter(Boolean))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { organizationId, id: { in: actorIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

  return res.json({
    status: "success",
    data: rows.map((row) => {
      const actor = actorMap.get(row.actorUserId);
      return {
        ...row,
        actorName: actor ? [actor.firstName, actor.lastName].filter(Boolean).join(" ") : "System",
        actorEmail: actor?.email || null,
      };
    }),
    meta: { returned: rows.length, limit: take },
  });
});

module.exports = router;
