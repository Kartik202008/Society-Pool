import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load environment variables from .env.local
const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
const envVars = Object.fromEntries(
  envFile
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setAdminRole(target) {
  console.log(`Setting admin role for: "${target || 'all Rahul accounts'}"...`);

  let query = supabase.from("users").update({ role: "admin" });

  if (!target) {
    // Default to promoting Rahul accounts to admin
    query = query.ilike("name", "%Rahul%");
  } else if (target.includes("-") && target.length === 36) {
    // UUID
    query = query.eq("id", target);
  } else {
    // Name pattern
    query = query.ilike("name", `%${target}%`);
  }

  const { data, error } = await query.select();

  if (error) {
    console.error("Failed to update role:", error.message);
    process.exit(1);
  }

  console.log("Successfully updated accounts to admin:", data);
}

const target = process.argv[2];
setAdminRole(target);
