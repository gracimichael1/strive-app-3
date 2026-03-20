import { runAnalysisPipeline } from "../pipeline";

describe("pipeline.js", () => {
  test("exports runAnalysisPipeline function", () => {
    expect(typeof runAnalysisPipeline).toBe("function");
  });

  test("rejects without required params", async () => {
    await expect(runAnalysisPipeline({})).rejects.toThrow();
  });

  test("rejects without API key", async () => {
    const fakeFile = new File(["fake"], "test.mp4", { type: "video/mp4" });
    await expect(
      runAnalysisPipeline({
        videoFile: fakeFile,
        profile: { name: "Emma", gender: "female", level: "Level 6" },
        event: "floor_exercise",
      })
    ).rejects.toThrow();
  });
});
