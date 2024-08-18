#!/bin/bash

# Get the latest tag
latest_tag=$(git describe --tags `git rev-list --tags --max-count=1`)

# Split the latest tag into major, minor, patch
IFS='.' read -r -a version_parts <<< "$latest_tag"

# Increment the patch version
patch_version=$((version_parts[2]+1))

# Create the new version tag
new_version="${version_parts[0]}.${version_parts[1]}.$patch_version"

# Output the new version
echo "new_version=$new_version" >> $GITHUB_ENV
