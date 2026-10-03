let offset = 0;

export const now = () => Date.now() + offset;

export const advanceClock = (ms) => {
  offset += ms;
  return now();
};

export const resetClock = () => {
  offset = 0;
};
