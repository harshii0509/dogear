"use client";

import { Comments, httpAdapter } from "@harshi04/dogear/react";

const adapter = httpAdapter("/api/comments", { guests: true });

export function DogearComments() {
  return <Comments adapter={adapter} shortcut="c" />;
}
