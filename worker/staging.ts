import worker from "./index";

const stagingWorker = {
  async fetch(...args: Parameters<typeof worker.fetch>): Promise<Response> {
    // The app uses static images; staging does not provision paid Images bindings.
    const response =
      new URL(args[0].url).pathname === "/_vinext/image"
        ? new Response("Not found", { status: 404 })
        : await worker.fetch(...args);
    const result = new Response(response.body, response);
    result.headers.set("X-Robots-Tag", "noindex, nofollow");
    return result;
  },
};

export default stagingWorker;
