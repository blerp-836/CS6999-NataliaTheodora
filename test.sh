#!/bin/bash

failed=0

runTests() {
  functionDir=$1
  cd $functionDir
  npm i
  npm test
}

# run each set of tests in a subshell, so that we don't have to track the chdir
(runTests api/eduapi) || failed=1
(runTests api/caliper) || failed=1
(runTests api/db-writer) || failed=1
(runTests api/pseudoPii) || failed=1

if [ $failed -gt 0 ]; then
  echo "There were test failures"
  exit 1
else
  echo "All tests passed"
  exit 0
fi
