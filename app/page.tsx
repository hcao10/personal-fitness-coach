import CoachApp from "./coach-app";

// The locale is resolved once in app/layout.tsx and provided to the whole tree,
// so this page no longer needs to resolve or hand down anything.
export default function Page() {
  return <CoachApp />;
}
