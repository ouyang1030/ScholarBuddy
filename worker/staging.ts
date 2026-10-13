import worker from "./index";

const stagingWorker = {
  async fetch(...args: Parameters<typeof worker.fetch>): Promise<Response> {
    const response = await worker.fetch(...args);
    const result = new Response(response.body, response);
    result.headers.set("X-Robots-Tag", "noindex, nofollow");
    return result;
  },
};

export default stagingWorker;
