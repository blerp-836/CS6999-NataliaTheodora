#!/bin/bash

failed=0

runLinting() {
  functionDir=$1
  cd $functionDir
  echo "linting $functionDir..."
  npm run lint
}

# run each set of tests in a subshell, so that we don't have to track the chdir
(runLinting api/eduapi) || failed=1
(runLinting api/caliper) || failed=1
(runLinting api/db-writer) || failed=1
(runLinting api/pseudoPii) || failed=1

if [ $failed -gt 0 ]; then
  echo "There were linting failures"
  exit 1
else
  echo "All lint checks passed"
  exit 0
fi
