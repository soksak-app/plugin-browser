# browser plugin repository 의 test 와 pack(docs/features.md). pack 은 pnpm pack 으로 release 를 쓴다.
.PHONY: install test test-app check pack check-push install-hooks

# The installation stage (core docs/spec/plugins.md#repositories): it installs the locked dependencies; the tests, checks and packs consume them without installing.
install:
	pnpm install --frozen-lockfile

# test runs only the tests of this plugin, over fakes of the core side.
test:
	pnpm test

# test-app runs the window checks of this plugin (e2e/) against the published core application of the core release of the installed
# @soksak/window-check (core docs/spec/plugins.md#window-checks-of-a-plugin): its bin soksak-test-app keeps the application zips of
# that release in build/app-cache/, installs the release of this repository that make pack writes, the start probe of the package and
# the fixture plugins of e2e/fixtures into each application, and runs the checks.
test-app:
	pnpm exec soksak-test-app

# check runs the checks of the kit releases that package.json pins: sok-check events counts the records missing from the sources
# and matches events.json with the emit sites, and sok-check docs checks the records. The application validates plugin.json
# when it installs the release, and the registry check compares the exposed names of the release with each listed core.
check:
	pnpm exec sok-check events --config event-sources.json --catalog events.json
	pnpm exec sok-check docs
	pnpm exec sok-check commands

pack:
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	pnpm pack --pack-destination $(OUT)

# The checks that a push needs: the commit messages and the checklist history of the pushed range, because a published commit
# is kept; CI runs the tests and checks on the pushed commits.
# RANGE holds the commits of the pushed refs; the pre-push hook sets it, and it defaults to origin/main..HEAD.
check-push:
	pnpm exec sok-check commits "$(or $(RANGE),origin/main..HEAD)"
	pnpm exec sok-check docs --range "$(or $(RANGE),origin/main..HEAD)"

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
install-hooks:
	@git config core.hooksPath .githooks
