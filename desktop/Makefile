.PHONY: all build release package-deb package-osx package-msi clean

all: build

build:
	cargo build

release:
	cargo build --release

package-deb: release
	cargo bundle --format deb --release

package-osx: release
	cargo bundle --format osx --release

package-msi: release
	cargo bundle --format msi --release

clean:
	cargo clean
