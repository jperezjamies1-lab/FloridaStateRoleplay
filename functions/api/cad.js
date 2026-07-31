import {
  json,
  body,
  timingSafeEqual
} from "../lib/http.js";

/*
  Florida State Roleplay CAD API

  Required Cloudflare secrets:
  - CAD_TOKEN_SECRET
  - CAD_FBI_CODE
  - CAD_FHP_CODE
  - CAD_FFW_CODE
  - CAD_STAFF_CODE

  Storage:
  - CAD_STATE KV, or
  - SITE_SETTINGS KV as a fallback
*/

const CAD_STATE_KEY = "fsrp_cad_state_v1";
const SESSION_LENGTH_MS = 8 * 60 * 60 * 1000;
const MAX_COLLECTION_ITEMS = 500;
const MAX_UNITS = 250;

const EMPTY_STATE = {
  dispatch: [],
  units: [],
  calls: [],
  records: [],
  reports: [],
  citations: [],
  warrants: [],
  radio: []
};

const COLLECTIONS = new Set([
  "dispatch",
  "calls",
  "records",
  "reports",
  "citations",
  "warrants",
  "radio"
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* =========================================================
   GENERAL HELPERS
========================================================= */

function normalizeCode(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim();
}

function normalizeSecret(value) {
  return String(value ?? "").trim();
}

function safeClone(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function createEmptyState() {
  return safeClone(EMPTY_STATE);
}

function getTokenSecret(env) {
  return normalizeSecret(
    env.CAD_TOKEN_SECRET ||
    env.AUTH_SECRET ||
    env.ADMIN_TOKEN ||
    env.OPERATIONS_TOKEN
  );
}

function getCadStore(env) {
  return env.CAD_STATE || env.SITE_SETTINGS || null;
}

function cadCodePairs(env) {
  return [
    {
      role: "fbi",
      agency: "FBI",
      code: normalizeSecret(env.CAD_FBI_CODE)
    },
    {
      role: "fhp",
      agency: "FHP",
      code: normalizeSecret(env.CAD_FHP_CODE)
    },
    {
      role: "ffw",
      agency: "FFW",
      code: normalizeSecret(env.CAD_FFW_CODE)
    },
    {
      role: "staff",
      agency: "Staff Team",
      code: normalizeSecret(env.CAD_STAFF_CODE)
    }
  ];
}

function configuredAgencies(env) {
  return cadCodePairs(env)
    .filter((entry) => entry.code.length > 0)
    .map((entry) => entry.agency);
}

function agencyFor(enteredCode, env) {
  const entered = normalizeCode(enteredCode);

  if (!entered) {
    return null;
  }

  for (const entry of cadCodePairs(env)) {
    if (!entry.code) {
      continue;
    }

    if (timingSafeEqual(entered, entry.code)) {
      return {
        role: entry.role,
        agency: entry.agency
      };
    }
  }

  return null;
}

/* =========================================================
   TOKEN SIGNING
========================================================= */

function bytesToBase64Url(bytes) {
  let value = "";

  for (const byte of bytes) {
    value += String.fromCharCode(byte);
  }

  return btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(value) {
  const normalized = String(value)
    .replaceAll("-", "+")
    .replaceAll("_", "/");

  const padding =
    "=".repeat((4 - (normalized.length % 4)) % 4);

  return Uint8Array.from(
    atob(normalized + padding),
    (character) => character.charCodeAt(0)
  );
}

async function importKey(secret, usage) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    [usage]
  );
}

async function sign(value, secret) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(secret, "sign"),
    encoder.encode(value)
  );

  return bytesToBase64Url(
    new Uint8Array(signature)
  );
}

async function issue(role, agency, secret) {
  const sessionData = {
    role,
    agency,
    issuedAt: Date.now(),
    exp: Date.now() + SESSION_LENGTH_MS
  };

  const payload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify(sessionData)
    )
  );

  const signature = await sign(
    payload,
    secret
  );

  return `${payload}.${signature}`;
}

async function verify(token, secret) {
  try {
    const [payload, signature] =
      String(token || "").split(".");

    if (!payload || !signature) {
      return null;
    }

    const valid =
      await crypto.subtle.verify(
        "HMAC",
        await importKey(secret, "verify"),
        base64UrlToBytes(signature),
        encoder.encode(payload)
      );

    if (!valid) {
      return null;
    }

    const data = JSON.parse(
      decoder.decode(
        base64UrlToBytes(payload)
      )
    );

    if (
      !data ||
      typeof data.exp !== "number" ||
      data.exp <= Date.now() ||
      !data.role ||
      !data.agency
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/* =========================================================
   DATA CLEANING
========================================================= */

function cleanString(value, max = 500) {
  return String(value ?? "")
    .replace(
      /[\u0000-\u001f\u007f]/g,
      " "
    )
    .trim()
    .slice(0, max);
}

function cleanItem(item = {}) {
  const output = {};

  if (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item)
  ) {
    return {
      id: crypto.randomUUID(),
      updatedAt: Date.now()
    };
  }

  for (
    const [key, value]
    of Object.entries(item)
  ) {
    const safeKey = cleanString(key, 80);

    if (!safeKey) {
      continue;
    }

    if (typeof value === "string") {
      const longField =
        safeKey === "body" ||
        safeKey === "details" ||
        safeKey === "notes" ||
        safeKey === "description";

      output[safeKey] = cleanString(
        value,
        longField ? 4000 : 500
      );
    } else if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      output[safeKey] = value;
    } else if (
      typeof value === "boolean"
    ) {
      output[safeKey] = value;
    }
  }

  output.id = cleanString(
    output.id || crypto.randomUUID(),
    80
  );

  output.updatedAt = Date.now();

  return output;
}

/* =========================================================
   CAD STORAGE
========================================================= */

function repairState(value) {
  const state =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value
      : createEmptyState();

  for (
    const key
    of Object.keys(EMPTY_STATE)
  ) {
    if (!Array.isArray(state[key])) {
      state[key] = [];
    }
  }

  return state;
}

async function loadState(store) {
  try {
    const stored = await store.get(
      CAD_STATE_KEY,
      "json"
    );

    return repairState(stored);
  } catch {
    return createEmptyState();
  }
}

async function saveState(
  store,
  state
) {
  await store.put(
    CAD_STATE_KEY,
    JSON.stringify(
      repairState(state)
    )
  );
}

function removeExpiredUnits(state) {
  const now = Date.now();

  state.units = state.units.filter(
    (unit) => {
      if (!unit.updatedAt) {
        return true;
      }

      return (
        now - Number(unit.updatedAt) <
        SESSION_LENGTH_MS
      );
    }
  );

  return state;
}

/* =========================================================
   READINESS ENDPOINT

   Open /api/cad in a browser to test setup.
========================================================= */

export async function onRequestGet({
  env
}) {
  const tokenSecret =
    getTokenSecret(env);

  const cadStore =
    getCadStore(env);

  const agencies =
    configuredAgencies(env);

  return json({
    ok:
      Boolean(tokenSecret) &&
      Boolean(cadStore) &&
      agencies.length > 0,

    cadReady:
      Boolean(tokenSecret) &&
      Boolean(cadStore) &&
      agencies.length > 0,

    configuredAgencies: agencies,

    storageReady:
      Boolean(cadStore),

    storageBinding:
      env.CAD_STATE
        ? "CAD_STATE"
        : env.SITE_SETTINGS
          ? "SITE_SETTINGS"
          : null,

    sessionSigningReady:
      Boolean(tokenSecret),

    apiVersion: 3
  });
}

/* =========================================================
   CAD ACTION ENDPOINT
========================================================= */

export async function onRequestPost({
  request,
  env
}) {
  const tokenSecret =
    getTokenSecret(env);

  const cadStore =
    getCadStore(env);

  const agencies =
    configuredAgencies(env);

  if (!tokenSecret) {
    return json(
      {
        error:
          "CAD session signing is not configured. Add CAD_TOKEN_SECRET to the Cloudflare Production environment and redeploy.",
        code: "CAD_TOKEN_SECRET_MISSING"
      },
      503
    );
  }

  if (!cadStore) {
    return json(
      {
        error:
          "CAD storage is not connected. Add SITE_SETTINGS or CAD_STATE as a KV binding and redeploy.",
        code: "CAD_STORAGE_MISSING"
      },
      503
    );
  }

  let data;

  try {
    data = await body(request);
  } catch {
    return json(
      {
        error:
          "The CAD request contained invalid JSON.",
        code: "INVALID_REQUEST_BODY"
      },
      400
    );
  }

  if (
    !data ||
    typeof data !== "object"
  ) {
    return json(
      {
        error:
          "A valid CAD request is required.",
        code: "INVALID_REQUEST"
      },
      400
    );
  }

  /* ===========================
     LOGIN
  ============================ */

  if (data.action === "login") {
    if (!agencies.length) {
      return json(
        {
          error:
            "No CAD department passwords are configured in this Cloudflare Production deployment.",
          code:
            "CAD_CODES_NOT_CONFIGURED",
          configuredAgencies: []
        },
        503
      );
    }

    const enteredCode =
      normalizeCode(data.code);

    if (!enteredCode) {
      return json(
        {
          error:
            "Enter your assigned CAD access code.",
          code: "CAD_CODE_REQUIRED",
          configuredAgencies: agencies
        },
        400
      );
    }

    const match =
      agencyFor(enteredCode, env);

    if (!match) {
      return json(
        {
          error:
            "The CAD access code did not match. Check capitalization and confirm the secret is saved in Cloudflare Production.",
          code: "INVALID_CAD_CODE",
          configuredAgencies: agencies
        },
        401
      );
    }

    const token = await issue(
      match.role,
      match.agency,
      tokenSecret
    );

    return json({
      ok: true,
      token,
      role: match.role,
      agency: match.agency,
      expiresIn:
        SESSION_LENGTH_MS,
      configuredAgencies:
        agencies,
      apiVersion: 3
    });
  }

  /* ===========================
     AUTHENTICATION
  ============================ */

  const user = await verify(
    data.token,
    tokenSecret
  );

  if (!user) {
    return json(
      {
        error:
          "Your CAD session expired or is invalid. Sign in again.",
        code:
          "CAD_SESSION_INVALID"
      },
      401
    );
  }

  let state =
    await loadState(cadStore);

  state = removeExpiredUnits(state);

  /* ===========================
     GET CURRENT STATE
  ============================ */

  if (data.action === "state") {
    return json({
      ok: true,
      state,
      user,
      apiVersion: 3
    });
  }

  /* ===========================
     ADD COLLECTION ITEM
  ============================ */

  if (data.action === "append") {
    const collection =
      cleanString(
        data.collection,
        50
      );

    if (
      !COLLECTIONS.has(collection)
    ) {
      return json(
        {
          error:
            "Invalid CAD collection.",
          code:
            "INVALID_COLLECTION"
        },
        400
      );
    }

    const item = {
      ...cleanItem(data.item),
      agency: user.agency,
      role: user.role,
      createdBy:
        cleanString(
          data.item?.createdBy ||
          data.item?.callsign ||
          user.agency,
          100
        )
    };

    state[collection].unshift(
      item
    );

    state[collection] =
      state[collection].slice(
        0,
        MAX_COLLECTION_ITEMS
      );
  }

  /* ===========================
     UPDATE UNIT
  ============================ */

  else if (
    data.action === "unit"
  ) {
    const item = {
      ...cleanItem(data.item),
      agency: user.agency,
      role: user.role
    };

    item.callsign =
      cleanString(
        item.callsign,
        50
      );

    if (!item.callsign) {
      return json(
        {
          error:
            "A callsign is required.",
          code:
            "CALLSIGN_REQUIRED"
        },
        400
      );
    }

    const normalizedCallsign =
      item.callsign.toLowerCase();

    const index =
      state.units.findIndex(
        (unit) =>
          String(
            unit.callsign || ""
          )
            .trim()
            .toLowerCase() ===
          normalizedCallsign
      );

    if (index < 0) {
      state.units.unshift(item);
    } else {
      state.units[index] = {
        ...state.units[index],
        ...item
      };
    }

    state.units =
      state.units.slice(
        0,
        MAX_UNITS
      );
  }

  /* ===========================
     REMOVE UNIT
  ============================ */

  else if (
    data.action === "remove-unit"
  ) {
    const callsign =
      cleanString(
        data.callsign,
        50
      ).toLowerCase();

    if (!callsign) {
      return json(
        {
          error:
            "A callsign is required.",
          code:
            "CALLSIGN_REQUIRED"
        },
        400
      );
    }

    state.units =
      state.units.filter(
        (unit) =>
          String(
            unit.callsign || ""
          )
            .trim()
            .toLowerCase() !==
          callsign
      );
  }

  /* ===========================
     UNKNOWN ACTION
  ============================ */

  else {
    return json(
      {
        error:
          "Unknown CAD action.",
        code:
          "UNKNOWN_CAD_ACTION"
      },
      400
    );
  }

  try {
    await saveState(
      cadStore,
      state
    );
  } catch {
    return json(
      {
        error:
          "The CAD could not save to Cloudflare KV. Check the SITE_SETTINGS or CAD_STATE binding.",
        code:
          "CAD_SAVE_FAILED"
      },
      500
    );
  }

  return json({
    ok: true,
    state,
    user,
    apiVersion: 3
  });
}
