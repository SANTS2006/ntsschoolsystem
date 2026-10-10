import { useQuery } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { fetchMyTranscript } from "./api";
import type { Transcript } from "./types";

export function useMyTranscript() {
  return useQuery<Transcript, ApiError>({
    queryKey: ["examinations", "transcript", "me"],
    queryFn: fetchMyTranscript,
  });
}
