import { selfxApi } from "@/lib/api";

export type SignupChallenge = {
  question: string;
  challengeToken: string;
  expiresAt: string;
};

export function getSignupChallenge(): Promise<SignupChallenge> {
  return selfxApi<SignupChallenge>("/api/v1/auth/signup-challenge");
}
