#!/bin/bash

# Exit script on any error
set -e

# Get the latest tag from GitLab
LATEST_TAG=$(git describe --tags `git rev-list --tags --max-count=1`)

# Check if a tag exists
if [ -z "$LATEST_TAG" ]; then
  echo "No tags found. Starting with 1.0.0"
  NEW_TAG="1.0.0"
else
  echo "Latest tag is: $LATEST_TAG"

  # Extract major, minor, and patch numbers (assuming format 'X.Y.Z')
  IFS='.' read -r -a VERSION_PARTS <<< "$LATEST_TAG"

  MAJOR=${VERSION_PARTS[0]}
  MINOR=${VERSION_PARTS[1]}
  PATCH=${VERSION_PARTS[2]}

  # Increment the patch version number
  PATCH=$((PATCH + 1))

  # Construct the new tag
  NEW_TAG="$MAJOR.$MINOR.$PATCH"
fi

# Display new tag
echo "New tag will be: $NEW_TAG"

# Create new tag
git tag "$NEW_TAG"

# Push the new tag to GitLab
git push origin "$NEW_TAG"

echo "Tag $NEW_TAG pushed successfully."
