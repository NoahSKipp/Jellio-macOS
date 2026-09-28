# Release mechanics mirrored from Jellio-Plugin's own Makefile
# (itself taken as-is from Gelato, https://github.com/lostb1t/Gelato,
# GPL-3.0), adapted here to bump package.json instead of a plugin manifest.

release:
	@echo "Fetching tags..."
	git fetch --tags
	@echo "Bumping version with git-cliff..."
	$(eval NEW_VERSION := $(shell git cliff --bumped-version))
	$(eval VERSION_NAME := $(NEW_VERSION:v%=%))
	@echo "New version will be: $(NEW_VERSION)"
	@echo "Generating changelog..."
	@git cliff --unreleased --tag $(NEW_VERSION) --strip all > /tmp/release_notes.md
	@echo "Updating version in package.json..."
	npm version $(VERSION_NAME) --no-git-tag-version --allow-same-version
	git add package.json package-lock.json
	@if git diff --cached --quiet; then \
		echo "package.json already at $(VERSION_NAME), nothing to commit."; \
	else \
		git commit -m "chore(release): bump version to $(NEW_VERSION)"; \
		echo "Pushing to git..."; \
		git push; \
	fi
	@echo "Creating GitHub release..."
	gh release create $(NEW_VERSION) --title "$(NEW_VERSION)" --notes-file /tmp/release_notes.md
	@echo "Release $(NEW_VERSION) created successfully!"

test:
	@echo "Fetching tags..."
	git fetch --tags
	@echo "Bumping version with git-cliff..."
	$(eval NEW_VERSION := $(shell git cliff --bumped-version))
	@echo "New version will be: $(NEW_VERSION)"
	@echo "Generating changelog..."
	@git cliff --unreleased --tag $(NEW_VERSION) --strip all > /tmp/release_notes.md
	@cat /tmp/release_notes.md

.PHONY: release test
