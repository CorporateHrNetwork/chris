const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(requireAuth);

const NEWS_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: NEWS_ATTACHMENT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_TYPES.has(String(file.mimetype || "").toLowerCase())) {
      const error = newsError("NEWS_ATTACHMENT_TYPE_NOT_ALLOWED", "Only PDF, JPG, PNG and WEBP files are allowed.");
      return cb(error);
    }
    return cb(null, true);
  },
});

const CATEGORIES = new Set([
  "ANNOUNCEMENT","PROMOTION","INTERNAL_CAREER","TRANSFER",
  "RETIREMENT","TERMINATION","EVENT","POLICY_HR_UPDATE"
]);

function newsError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function clean(value) { return String(value ?? "").trim(); }

function handle(res, error, fallback) {
  return res.status(error.statusCode || 500).json({
    status: "error",
    code: error.code || "NEWS_ERROR",
    message: error.message || fallback,
  });
}

router.get("/", requirePermission("employees.view"), async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id","category","title","summary","body","status","isPinned","publishAt","expireAt","createdAt","updatedAt",
              "attachmentFileName","attachmentMimeType","attachmentSize"
         FROM "internal_news_posts"
        WHERE "organizationId"=$1
        ORDER BY "isPinned" DESC,COALESCE("publishAt","createdAt") DESC,"createdAt" DESC`,
      req.auth.organizationId
    );
    return res.json({ status: "success", data: rows });
  } catch (error) {
    return handle(res, error, "Unable to load internal news.");
  }
});

router.post("/", requirePermission("employees.update"), upload.single("attachment"), async (req, res) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: req.auth.organizationId },
      select: { slug: true },
    });
    if (organization?.slug !== "zermatt-liquor-limited") {
      throw newsError("NEWS_NOT_ENABLED", "Internal employee news is currently enabled for Zermatt Liquor Limited.", 403);
    }

    const category = clean(req.body?.category).toUpperCase();
    const title = clean(req.body?.title);
    const summary = clean(req.body?.summary) || null;
    const body = clean(req.body?.body);
    const attachment = req.file || null;
    const status = clean(req.body?.status || "DRAFT").toUpperCase();
    const isPinned = req.body?.isPinned === true || clean(req.body?.isPinned).toLowerCase() === "true";
    if (!CATEGORIES.has(category)) throw newsError("INVALID_NEWS_CATEGORY", "Select a valid news category.");
    if (!title || (!body && !attachment)) throw newsError("NEWS_FIELDS_REQUIRED", "Title plus either a message or an attachment is required.");
    if (!["DRAFT","PUBLISHED"].includes(status)) throw newsError("INVALID_NEWS_STATUS", "News can be saved as DRAFT or PUBLISHED.");

    const id = crypto.randomUUID();
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO "internal_news_posts"
        ("id","organizationId","category","title","summary","body","status","isPinned","publishAt","expireAt",
         "attachmentFileName","attachmentMimeType","attachmentSize","attachmentData",
         "createdByUserId","updatedByUserId","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
         CASE WHEN $7='PUBLISHED' THEN CURRENT_TIMESTAMP ELSE NULL END,
         $9::timestamp,$10,$11,$12,$13,$14,$14,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       RETURNING "id","organizationId","category","title","summary","body","status","isPinned","publishAt","expireAt",
                 "attachmentFileName","attachmentMimeType","attachmentSize","createdAt","updatedAt"`,
      id,
      req.auth.organizationId,
      category,
      title,
      summary,
      body,
      status,
      isPinned,
      req.body?.expireAt || null,
      attachment?.originalname || null,
      attachment?.mimetype || null,
      attachment?.size || null,
      attachment?.buffer || null,
      req.auth.userId || null
    );

    await prisma.organizationAudit.create({
      data: {
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId || null,
        entityType: "InternalNewsPost",
        entityId: id,
        action: status === "PUBLISHED" ? "NEWS_PUBLISHED" : "NEWS_DRAFT_CREATED",
        newValue: { category, title, status, isPinned, attachmentFileName: attachment?.originalname || null, attachmentMimeType: attachment?.mimetype || null, attachmentSize: attachment?.size || null },
        reason: "Internal employee communication",
      },
    });

    return res.status(201).json({ status: "success", data: rows[0] });
  } catch (error) {
    return handle(res, error, "Unable to create internal news.");
  }
});

router.get("/:id/attachment", requirePermission("employees.view"), async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "attachmentFileName","attachmentMimeType","attachmentSize","attachmentData"
         FROM "internal_news_posts"
        WHERE "organizationId"=$1 AND "id"=$2
        LIMIT 1`,
      req.auth.organizationId,
      req.params.id
    );
    const row = rows[0];
    if (!row || !row.attachmentData) throw newsError("NEWS_ATTACHMENT_NOT_FOUND", "This news item has no attachment.", 404);
    res.setHeader("Content-Type", row.attachmentMimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(row.attachmentSize || row.attachmentData.length));
    const safeName = String(row.attachmentFileName || "news-attachment").replace(/[\r\n"]/g, "_");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    return res.send(row.attachmentData);
  } catch (error) {
    return handle(res, error, "Unable to load news attachment.");
  }
});

router.patch("/:id/status", requirePermission("employees.update"), async (req, res) => {
  try {
    const status = clean(req.body?.status).toUpperCase();
    if (!["PUBLISHED","ARCHIVED","DRAFT"].includes(status)) {
      throw newsError("INVALID_NEWS_STATUS", "Status must be DRAFT, PUBLISHED or ARCHIVED.");
    }
    const rows = await prisma.$queryRawUnsafe(
      `UPDATE "internal_news_posts"
          SET "status"=$3,
              "publishAt"=CASE WHEN $3='PUBLISHED' AND "publishAt" IS NULL THEN CURRENT_TIMESTAMP ELSE "publishAt" END,
              "updatedByUserId"=$4,
              "updatedAt"=CURRENT_TIMESTAMP
        WHERE "organizationId"=$1 AND "id"=$2
        RETURNING *`,
      req.auth.organizationId,
      req.params.id,
      status,
      req.auth.userId || null
    );
    if (!rows[0]) throw newsError("NEWS_NOT_FOUND", "News item not found.", 404);

    await prisma.organizationAudit.create({
      data: {
        organizationId: req.auth.organizationId,
        actorUserId: req.auth.userId || null,
        entityType: "InternalNewsPost",
        entityId: req.params.id,
        action: `NEWS_${status}`,
        newValue: { status },
        reason: "Internal employee communication lifecycle",
      },
    });
    return res.json({ status: "success", data: rows[0] });
  } catch (error) {
    return handle(res, error, "Unable to update internal news.");
  }
});

module.exports = router;
