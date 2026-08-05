import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

const HERO_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBSREMJVOrlUjsKyhowReTUUQJNNEouSNGz1yKdIfy0Q7fa1UjfjNSx3CLWp96rj1fAEtzGl8nw3PEs8CP2P1PZY6BDEguaMPqVEuN-XbMd-1u09LgmfMd7xmNirdMcP7WwN7-JZlNb-UpNSzHlZhuHen5oPydZE45EjAV0F5euDxsnoJbT37UWwuNOuWiatHizsSfGldRlf9t0DaJ1FnyKE2EvTpcntl6XN7EcuXL5ZAKB-eIAwFXJBmz8sH9bwzbyScjuXMRZKtLV";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Where ProtectedRoute bounced them from, if anywhere.
  const from = (location.state as { from?: string } | null)?.from ?? "/home";

  // Covers both a successful login and arriving here with a live session.
  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // Navigation happens in the effect above, once user is set.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-background text-on-background min-h-screen font-body-md flex flex-col">
      <header className="w-full flex justify-between items-center px-container-padding-mobile py-stack-md md:px-container-padding-desktop">
        <Link
          to="/"
          className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tight"
        >
          Plately
        </Link>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center px-container-padding-mobile py-stack-lg">
        <div className="w-full max-w-md">
          {/* Editorial hero image */}
          <div className="mb-stack-lg overflow-hidden rounded-2xl editorial-shadow aspect-[16/10]">
            <div
              className="w-full h-full bg-cover bg-center"
              style={{ backgroundImage: `url('${HERO_IMG}')` }}
            />
          </div>

          <section className="space-y-stack-md">
            <div className="space-y-unit">
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-background">
                Welcome back
              </h1>
              <p className="font-body-md text-on-surface-variant">
                Continue your mindful nutrition journey.
              </p>
            </div>

            <form className="space-y-stack-md mt-stack-lg" onSubmit={handleSubmit}>
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 p-4 rounded-[14px] bg-error-container text-on-error-container"
                >
                  <Icon name="error" className="text-[20px] shrink-0" />
                  <span className="font-body-md text-body-md">{error}</span>
                </div>
              )}

              <div className="space-y-unit">
                <Label htmlFor="email" className="block px-unit">
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hello@example.com"
                />
              </div>

              <div className="space-y-unit">
                <div className="px-unit">
                  <Label htmlFor="password">Password</Label>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                    aria-label="Toggle password visibility"
                  >
                    <Icon
                      name={showPassword ? "visibility_off" : "visibility"}
                      className="text-[20px]"
                    />
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                size="block"
                className="mt-stack-lg"
                disabled={submitting}
              >
                {submitting ? "Logging in…" : "Log in"}
                {!submitting && (
                  <Icon name="arrow_forward" className="text-[18px]" />
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="flex items-center py-stack-md">
              <div className="flex-grow border-t border-outline-variant" />
              <span className="px-stack-md font-label-sm text-label-sm text-outline">
                OR
              </span>
              <div className="flex-grow border-t border-outline-variant" />
            </div>

            <div className="text-center">
              <p className="font-body-md text-on-surface-variant">
                New to Plately?{" "}
                <Link
                  to="/signup"
                  className="text-primary font-label-md hover:underline decoration-primary/30 underline-offset-4"
                >
                  Create an account
                </Link>
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="w-full py-stack-lg px-container-padding-mobile text-center">
        <p className="font-label-sm text-label-sm text-outline">
          © 2024 Plately. Designed for mindful eating.
        </p>
      </footer>
    </div>
  );
}
