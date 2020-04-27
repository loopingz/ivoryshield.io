const ShellCommand = async (console, args) => {
  if (args._[0] === "faketerm") {
    return await console.fakeTerm();
  }
  console.log("INFO", "Will display ivoryshield IvoryShield something", args);
  return new Promise((resolve) => {
    setTimeout(resolve, 10000);
  });
};

export { ShellCommand };
