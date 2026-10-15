export async function readJsonResponse(response: Response) {
  if (response.status === 204) return undefined;
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an invalid response. Please try again."
        : `The service is temporarily unavailable (HTTP ${response.status}). Please try again later.`,
    );
  }
}
