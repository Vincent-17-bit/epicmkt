import { hasOptionScales, stripOptionScales } from "@epicmkt/shared";

// Saves an item. If the database refuses the options (invalid_options) and they carried scale data, it is tried once more without that data:
// a database that does not have migration 0100_option_scales_sizes.sql yet cannot store it, and the seller should still be able to save.
// Any other error, and an invalid_options that is not about scales (the retry fails the same way), reaches the seller unchanged.
export async function saveWithScaleFallback(save, body) {
  try {
    return await save(body);
  } catch (error) {
    if (error?.code !== "invalid_options" || !hasOptionScales(body?.options)) throw error;
    return save({ ...body, options: stripOptionScales(body.options) });
  }
}
