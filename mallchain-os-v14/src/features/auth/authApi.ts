export type Result = { ok: boolean; message?: string };
export type SignInData = { email: string; password: string; remember: boolean };
export type SignUpData = { email: string; password: string; referral: string };

export const authApi = {
  async signIn(data: SignInData): Promise<Result> {
    // TODO: Wire up with real API
    // const res = await fetch("/api/auth/login", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(data),
    // });
    // return { ok: res.ok };
    console.log("signIn", data.email);
    return { ok: true };
  },

  async signUp(data: SignUpData): Promise<Result> {
    // TODO: Wire up with real API
    // After success, send the user into your KYC flow.
    // const res = await fetch("/api/auth/register", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(data),
    // });
    // if (res.ok) {
    //   window.location.hash = "/kyc";
    // }
    // return { ok: res.ok };
    console.log("signUp", data.email);
    return { ok: true };
  },

  async google(): Promise<Result> {
    // TODO: Start your Google OAuth flow here.
    console.log("google");
    return { ok: true };
  },

  async forgot(): Promise<Result> {
    // TODO: Open your password reset flow here.
    console.log("forgot");
    return { ok: true };
  },
};
