import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1.5">
        <h1>Marketing Platform</h1>
        <p className="text-sm text-muted">AI drafts your content. Nothing goes out until a person approves it.</p>
      </div>
      <div className="surface p-6">
        <SignInForm />
      </div>
    </main>
  );
}
