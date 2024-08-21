#!/bin/bash

# Get the latest tag, defaulting to v0.0.0 if no tags exist
latest_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")

# Remove the 'v' prefix if it exists
latest_tag=${latest_tag#v}

# Split the latest tag into major, minor, patch
IFS='.' read -r -a version_parts <<< "$latest_tag"

# Ensure we have three parts, defaulting to 0 if not present
major=${version_parts[0]:-0}
minor=${version_parts[1]:-0}
patch=${version_parts[2]:-0}

# Increment the patch version
patch=$((patch + 1))

# Create the new version tag
new_version="v$major.$minor.$patch"

# Output the new version
echo "NEW_VERSION=$new_version" >> $GITHUB_ENV
echo "New version: $new_version"
