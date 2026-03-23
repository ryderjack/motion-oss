import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { supabase } from "@/lib/supabase";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        const email = user.email!;
        const name = user.name ?? email.split("@")[0];
        const image = user.image ?? null;

        const { data: existingUser } = await supabase
          .from("users")
          .select("id")
          .eq("email", email)
          .single();

        let userId: string;

        if (existingUser) {
          userId = existingUser.id;
        } else {
          const { data: newUser } = await supabase
            .from("users")
            .insert({ email, name, image })
            .select("id")
            .single();

          if (!newUser) return token;
          userId = newUser.id;
        }

        token.sub = userId;

        const defaultWorkspaceId = process.env.DEFAULT_WORKSPACE_ID;
        if (defaultWorkspaceId) {
          await supabase
            .from("members")
            .upsert(
              { user_id: userId, workspace_id: defaultWorkspaceId, role: "EDITOR" },
              { onConflict: "user_id,workspace_id" }
            );
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
