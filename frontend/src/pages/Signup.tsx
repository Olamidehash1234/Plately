import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

const MIN_PASSWORD_LENGTH = 8;

export default function Signup() {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { signup, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/home", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    // Checked here as well as server-side so the user gets the message
    // without a round trip.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      await signup(email.trim(), password, name.trim());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-container-padding-mobile md:p-container-padding-desktop relative overflow-hidden">
      {/* Back button */}
      <nav className="fixed top-stack-md left-container-padding-mobile z-10">
        <Link
          to="/"
          className="flex items-center gap-2 text-on-surface-variant hover:opacity-80 transition-opacity font-label-md text-label-md"
        >
          <Icon name="arrow_back" />
          <span>Back</span>
        </Link>
      </nav>

      <main className="w-full max-w-[400px]">
        <header className="text-center mb-stack-lg">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tight mb-2">
            Plately
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Start your mindful nutrition journey today.
          </p>
        </header>

        <section className="bg-surface-container-lowest rounded-[20px] p-stack-lg border border-line editorial-shadow">
          <h2 className="font-headline-md text-headline-md mb-stack-lg text-left">
            Create Account
          </h2>
          <form className="flex flex-col gap-stack-md" onSubmit={handleSubmit}>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 p-4 rounded-[14px] bg-error-container text-on-error-container"
              >
                <Icon name="error" className="text-[20px] shrink-0" />
                <span className="font-body-md text-body-md">{error}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label
                className="font-label-sm text-label-sm text-on-surface-variant ml-1"
                htmlFor="name"
              >
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="E.g. Julian Barnes"
                className="w-full px-stack-md py-3 bg-white border border-line rounded-[14px] font-body-md text-body-md text-on-surface placeholder:text-[#6A6A62] outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                className="font-label-sm text-label-sm text-on-surface-variant ml-1"
                htmlFor="email"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-stack-md py-3 bg-white border border-line rounded-[14px] font-body-md text-body-md text-on-surface placeholder:text-[#6A6A62] outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                className="font-label-sm text-label-sm text-on-surface-variant ml-1"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-stack-md py-3 bg-white border border-line rounded-[14px] font-body-md text-body-md text-on-surface placeholder:text-[#6A6A62] outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-stack-md top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  aria-label="Toggle password visibility"
                >
                  <Icon
                    name={showPassword ? "visibility_off" : "visibility"}
                    className="text-[20px]"
                  />
                </button>
              </div>
            </div>

            <p className="font-label-sm text-label-sm text-on-surface-variant text-center px-2 mt-2">
              Your account, meal photos and nutrition history are stored on this
              system and are not shared with anyone else.
            </p>

            <Button
              type="submit"
              size="block"
              className="mt-stack-sm group"
              disabled={submitting}
            >
              <span>{submitting ? "Creating account…" : "Create account"}</span>
              {!submitting && (
                <Icon
                  name="arrow_forward"
                  className="text-[18px] group-hover:translate-x-0.5 transition-transform"
                />
              )}
            </Button>
          </form>
        </section>

        <footer className="text-center mt-stack-lg">
          <p className="font-body-md text-body-md text-on-surface-variant">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-primary font-semibold hover:underline ml-1"
            >
              Log in
            </Link>
          </p>
        </footer>
      </main>

      {/* Subtle atmosphere gradient */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] right-[-5%] w-[400px] h-[400px] bg-primary-fixed rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-secondary-fixed rounded-full blur-[120px]" />
      </div>
    </div>
  );
}
