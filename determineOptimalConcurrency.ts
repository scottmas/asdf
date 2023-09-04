import PQueue from "p-queue";
import _ from "lodash";

export async function determineOptimalConcurrency(
  task: () => Promise<void>,
  opts: {
    numSecondsPerConcurrencyTest: number;
    minConcurrency: number;
    stepSize: number;
    numWarmupTasks: number;
  }
): Promise<number> {
  const warmupQueue = new PQueue({ concurrency: opts.minConcurrency });
  await Promise.all(
    Array.from({ length: opts.numWarmupTasks || 100 }).map(async () => {
      await new Promise((res) => setTimeout(res, Math.random() * 50));
      await warmupQueue.add(task);
    })
  );
  console.info("Warmup completed...");

  const testResults: { concurrency: number; numTasksCompleted: number }[] = [];
  let concurrency = opts.minConcurrency;
  while (true) {
    const queue = new PQueue({ concurrency });
    let numTasksCompleted = 0;

    //Ensure queue is always full during testing period
    queue.on("completed", () => {
      numTasksCompleted++;
      queue.add(task);
    });

    //Initialize queue tasks
    await Promise.all(
      Array.from({ length: concurrency }).map(async () => {
        await new Promise((res) => setTimeout(res, Math.random() * 50));
        queue.add(task);
      })
    );

    await new Promise((res) =>
      setTimeout(res, 1000 * opts.numSecondsPerConcurrencyTest)
    );

    queue.off("completed");

    const prevRollingAverageTasksCompleted = rollingAverageBy(
      testResults,
      3,
      (a) => a.numTasksCompleted
    );

    const curr = { concurrency, numTasksCompleted };
    testResults.push(curr);

    const currRollingAverageTasksCompleted = rollingAverageBy(
      testResults,
      3,
      (a) => a.numTasksCompleted
    );

    console.log(concurrency, currRollingAverageTasksCompleted);

    if (testResults.length > 1) {
      if (currRollingAverageTasksCompleted > prevRollingAverageTasksCompleted) {
        concurrency += opts.stepSize;
      } else {
        concurrency -= opts.stepSize;
      }
    } else {
      concurrency += opts.stepSize;
    }

    await queue.onEmpty();

    const optimal = _(testResults)
      .groupBy((a) => a.concurrency)
      .values()
      .find((a) => a.length >= 3); //The optimal concurrency is the concurrency that we keep coming back to

    if (optimal) {
      const optimalConcurrency = optimal[0]!.concurrency;
      console.info("Determined optimal concurrency:", optimalConcurrency);
      return optimalConcurrency;
    }
  }
}

function rollingAverageBy<T>(arr: T[], N: number, byFn: (t: T) => number) {
  // Get the last N elements from the array
  var lastNElements = arr.slice(Math.max(arr.length - N, 0));

  // Compute the average
  var sum = lastNElements.reduce((a, b) => a + byFn(b), 0);
  return sum / lastNElements.length;
}
