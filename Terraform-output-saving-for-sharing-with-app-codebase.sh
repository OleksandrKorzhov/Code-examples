#!/usr/bin/env sh

#
# This script is supposed to run from "terraform" directory and save the output to the "terraform/outputs/ENV_SPECIFIC_FILE.json" file
# Where "ENV_SPECIFIC_FILE" is equal to the current terraform workspace
#

CURRENT_DIR=$(pwd)
TARGET_PATH="outputs/$(terraform workspace show).json"

echo "current directory is $CURRENT_DIR"
echo "Saving the terraform output into $CURRENT_DIR/$TARGET_PATH file"
terraform output -json > "$TARGET_PATH"
