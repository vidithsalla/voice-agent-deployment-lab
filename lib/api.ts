import { NextResponse } from "next/server";
import { ZodSchema } from "zod";

export async function parseJson<T>(request: Request, schema: ZodSchema<T>) {
  const body = await request.json();
  return schema.safeParse(body);
}

export function badRequest(errors: Array<{ code: string; message: string }>) {
  return NextResponse.json(
    {
      ok: false,
      errors
    },
    { status: 400 }
  );
}
