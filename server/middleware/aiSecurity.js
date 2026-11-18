
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "express-rate-limit";

// ==========================================
// SUPABASE AUTH CONFIGURATION
// ==========================================

const supabaseUrl = process.env.SUPABASE_URL;

const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in server/.env"
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

// ==========================================
// VERIFY SUPABASE ACCESS TOKEN
// ==========================================

export async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;

  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      error: "Please log in to use StudyRoom AI.",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      error: "Missing authentication token.",
    });
  }

  try {
    const { data, error } =
      await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        error:
          "Your session is invalid or expired. Please log in again.",
      });
    }

    if (data.user.is_anonymous) {
      return res.status(403).json({
        error:
          "A registered StudyRoom account is required.",
      });
    }

    // Identity verified by Supabase Auth.
    req.studyRoomUser = {
      id: data.user.id,
      email: data.user.email,
    };

    return next();
  } catch (error) {
    console.error(
      "Authentication verification error:",
      error
    );

    return res.status(503).json({
      error:
        "Authentication service is temporarily unavailable.",
    });
  }
}

// ==========================================
// AI REQUEST RATE LIMIT
// Shared across all AI generation endpoints
// ==========================================

export const aiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 20,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    error:
      "Too many AI requests. Please try again later.",
  },
});

// ==========================================
// RESTRICTED CORS CONFIGURATION
// ==========================================

const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const isDevelopment =
  process.env.NODE_ENV !== "production";

export const secureCorsOptions = {
  origin(origin, callback) {
    // Non-browser requests have no Origin header.
    // They still require authentication.
    if (!origin) {
      return callback(null, true);
    }

    const isAllowedProductionOrigin =
      allowedOrigins.has(origin);

    const isLocalViteOrigin =
      isDevelopment &&
      /^http:\/\/(localhost|127\.0\.0\.1):\d{4,5}$/.test(
        origin
      );

    if (
      isAllowedProductionOrigin ||
      isLocalViteOrigin
    ) {
      return callback(null, true);
    }

    return callback(
      new Error("CORS_ORIGIN_DENIED")
    );
  },

  methods: ["GET", "POST", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
  ],

  optionsSuccessStatus: 204,
};

export function handleSecurityErrors(
  error,
  _req,
  res,
  next
) {
  if (error.message === "CORS_ORIGIN_DENIED") {
    return res.status(403).json({
      error: "Request origin is not allowed.",
    });
  }

  return next(error);
}
