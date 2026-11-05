# browser plugin repository 의 test 와 pack(docs/features.md). pack 은 pnpm pack 으로 release 를 쓴다.
.PHONY: install test check pack push-check hooks

# The installation stage (core docs/spec/plugins.md#repositories): it installs the locked dependencies; the tests, checks and packs consume them without installing.
install:
	pnpm install --frozen-lockfile

# test runs only the tests of this plugin, over fakes of the core side.
test:
	pnpm test

# check runs the checks of the kit releases that package.json pins: soksak-check events counts the records missing from the sources
# and matches events.json with the emit sites, and soksak-check docs checks the records. The application validates plugin.json
# when it installs the release, and the registry check compares the exposed names of the release with each listed core.
check:
	pnpm exec soksak-check events --config event-sources.json --catalog events.json
	pnpm exec soksak-check docs

pack:
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	pnpm pack --pack-destination $(OUT)

# The check that a push needs: the commit messages of the pushed range, because a published commit message is kept; CI runs
# the tests and checks on the pushed commits.
# RANGE holds the commits of the pushed refs; the pre-push hook sets it, and it defaults to origin/main..HEAD.
push-check:
	pnpm exec soksak-check commits "$(or $(RANGE),origin/main..HEAD)"

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
