import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Classify from "@/pages/Classify";
import { AuthProvider } from "@/lib/auth";
import { ApiError, api, setToken } from "@/lib/api";
import { makeMeal, testUser } from "@/test/fixtures";

// Keep the real ApiError and token helpers; stub only the endpoints.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      me: vi.fn(),
      classify: vi.fn(),
      classifyStatus: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

function ResultProbe() {
  const { mealId } = useParams();
  return <p>Result for meal {mealId}</p>;
}

function renderClassify() {
  return render(
    <MemoryRouter initialEntries={["/classify"]}>
      <AuthProvider>
        <Routes>
          <Route path="/classify" element={<Classify />} />
          <Route path="/meal-result/:mealId" element={<ResultProbe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const photo = () =>
  new File(["fake-jpeg-bytes"], "plate.jpg", { type: "image/jpeg" });

/** The hidden file input the "Upload from gallery" button clicks. */
function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  return input as HTMLInputElement;
}

beforeEach(() => {
  setToken("test-token");
  mockedApi.me.mockResolvedValue(testUser);
  mockedApi.classifyStatus.mockResolvedValue({ ready: true, reason: null });
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:preview"),
    revokeObjectURL: vi.fn(),
  });
});

describe("Classify", () => {
  it("warns up front when the model is unavailable", async () => {
    mockedApi.classifyStatus.mockResolvedValue({
      ready: false,
      reason: "No trained model found at ml/artifacts/model.tflite.",
    });

    renderClassify();

    expect(
      await screen.findByText("Classification is unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No trained model found at ml/artifacts/model.tflite."),
    ).toBeInTheDocument();
  });

  it("says nothing about the model when it is ready", async () => {
    renderClassify();

    await waitFor(() => expect(mockedApi.classifyStatus).toHaveBeenCalled());
    expect(
      screen.queryByText("Classification is unavailable"),
    ).not.toBeInTheDocument();
  });

  it("previews a chosen photo and offers the meal tags", async () => {
    const user = userEvent.setup();
    renderClassify();

    await user.upload(fileInput(), photo());

    expect(
      await screen.findByAltText("The meal you are about to classify."),
    ).toHaveAttribute("src", "blob:preview");
    expect(screen.getByRole("button", { name: "Classify" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lunch" })).toBeInTheDocument();
  });

  it("sends the photo with the chosen tag and opens the result", async () => {
    const user = userEvent.setup();
    mockedApi.classify.mockResolvedValue({
      meal: makeMeal({ id: 42 }),
      alternatives: [],
      low_confidence: false,
    });

    renderClassify();
    await user.upload(fileInput(), photo());
    await user.click(screen.getByRole("button", { name: "Dinner" }));
    await user.click(screen.getByRole("button", { name: "Classify" }));

    await waitFor(() =>
      expect(screen.getByText("Result for meal 42")).toBeInTheDocument(),
    );

    const [sentFile, options] = mockedApi.classify.mock.calls[0];
    expect(sentFile.name).toBe("plate.jpg");
    expect(options).toEqual({ mealTag: "Dinner" });
  });

  it("explains a 503 and keeps the photo so it can be retried", async () => {
    const user = userEvent.setup();
    mockedApi.classify.mockRejectedValue(
      new ApiError("The model is not loaded.", 503),
    );

    renderClassify();
    await user.upload(fileInput(), photo());
    await user.click(screen.getByRole("button", { name: "Classify" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The model is not loaded.");
    expect(alert).toHaveTextContent(/only feature that needs the trained model/i);
    // Still on the chosen-photo view, ready for another attempt.
    expect(screen.getByRole("button", { name: "Classify" })).toBeInTheDocument();
  });

  it("surfaces any other failure verbatim", async () => {
    const user = userEvent.setup();
    mockedApi.classify.mockRejectedValue(
      new ApiError("Could not reach the server. Check that the API is running.", 0),
    );

    renderClassify();
    await user.upload(fileInput(), photo());
    await user.click(screen.getByRole("button", { name: "Classify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not reach the server/i,
    );
  });

  it("suggests uploading instead when the camera is blocked", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
      },
    });

    renderClassify();
    await user.click(screen.getByRole("button", { name: /take photo/i }));

    expect(await screen.findByText(/camera access was blocked/i)).toBeInTheDocument();
  });

  it("reports a device with no camera at all", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException("None", "NotFoundError")),
      },
    });

    renderClassify();
    await user.click(screen.getByRole("button", { name: /take photo/i }));

    expect(await screen.findByText(/no camera is available/i)).toBeInTheDocument();
  });

  it("goes back to the start when a different photo is wanted", async () => {
    const user = userEvent.setup();
    renderClassify();

    await user.upload(fileInput(), photo());
    await user.click(
      screen.getByRole("button", { name: /choose a different photo/i }),
    );

    expect(screen.getByText("Capture your meal")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Classify" }),
    ).not.toBeInTheDocument();
  });
});
