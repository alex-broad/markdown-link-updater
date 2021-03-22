import { ChangeEvent, ChangeEventPayload, Edit, FileList } from "../models";
import { Options, pureGetEdits } from "../pure-get-edits";

const trim = (s: string) => s.trim();
const trimLines = (s: string) => s.trim().split("\n").map(trim).join("\n");

describe("pureGetEdits", () => {
  describe("rename", () => {
    interface CompactEdit extends Omit<Edit, "range"> {
      range: string;
    }

    interface TestRenameOptions extends Partial<Options> {
      payload: ChangeEventPayload["rename"];
      markdownFiles: FileList;
      expectedEdits: CompactEdit[];
    }

    const testRename = ({
      payload,
      markdownFiles,
      expectedEdits,
      ...options
    }: TestRenameOptions) => {
      const event: ChangeEvent<"rename"> = {
        type: "rename",
        payload,
      };

      const edits = pureGetEdits(event, markdownFiles, options);

      expect(edits).toEqual(
        expectedEdits.map((e) => {
          const [start, end] = e.range.split("-");
          const [startLine, startCharacter] = start.split(":");
          const [endLine, endCharacter] = end.split(":");

          const edit: Edit = {
            ...e,
            range: {
              start: {
                line: parseInt(startLine),
                character: parseInt(startCharacter),
              },
              end: {
                line: parseInt(endLine),
                character: parseInt(endCharacter),
              },
            },
          };

          return edit;
        })
      );
    };

    it("updates the renamed files own links when it is moved", () => {
      testRename({
        payload: {
          pathBefore: "file-1.md",
          pathAfter: "folder/file-1.md",
        },
        markdownFiles: [
          {
            path: "folder/file-1.md",
            content: trimLines(`
              [link to a website](http://www.example.com)
              [link to file-2](file-2.md)
            `),
          },
          {
            path: "file-2.md",
            content: "# Just some markdown file",
          },
        ],
        expectedEdits: [
          {
            path: "folder/file-1.md",
            range: "0:0-0:43",
            newText: "[link to a website](../http:/www.example.com)",
            // This link will not actually be updated, because it requires this path to exist
            requiresPathToExist: "http:/www.example.com",
          },
          {
            path: "folder/file-1.md",
            range: "1:0-1:27",
            newText: "[link to file-2](../file-2.md)",
            requiresPathToExist: "file-2.md",
          },
        ],
      });
    });

    it("updates files linking to the renamed file", () => {
      testRename({
        payload: {
          pathBefore: "folder/file-2.md",
          pathAfter: "folder/new-name.md",
        },
        markdownFiles: [
          {
            path: "file-1.md",
            content:
              "# File 1\na link [link to file-2](./folder/file-2.md) is here",
          },
          {
            path: "folder/new-name.md",
            content: "# Just some markdown file",
          },
        ],
        expectedEdits: [
          {
            path: "file-1.md",
            range: "1:7-1:43",
            newText: "[link to file-2](folder/new-name.md)",
          },
        ],
      });
    });
    it("can update multiple links in the same file", () => {
      testRename({
        payload: {
          pathBefore: "old.txt",
          pathAfter: "new.txt",
        },
        markdownFiles: [
          {
            path: "file.md",
            content: trimLines(`
              - Link one: [link no. 1](./old.txt)
              - Link two: [link no. 2](old.txt)
            `),
          },
        ],
        expectedEdits: [
          {
            path: "file.md",
            range: "0:12-0:35",
            newText: "[link no. 1](new.txt)",
          },
          {
            path: "file.md",
            range: "1:12-1:33",
            newText: "[link no. 2](new.txt)",
          },
        ],
      });
    });

    it("uses exclude glob", () => {
      testRename({
        payload: {
          pathBefore: "workspace/node_modules/file-2.md",
          pathAfter: "workspace/node_modules/file-2-changed.md",
        },
        markdownFiles: [
          {
            path: "workspace/file-1.md",
            content: "[link](node_modules/file-2.md)",
          },
          {
            path: "workspace/node_modules/file-2-changed.md",
            content: "# Just some markdow file",
          },
        ],
        workspacePath: "workspace/",
        // Exclude node_modules at any level
        exclude: ["**/node_modules/**"],
        expectedEdits: [],
      });
    });

    it("uses relative path in exclude", () => {
      testRename({
        payload: {
          pathBefore: "workspace/node_modules/file-2.md",
          pathAfter: "workspace/node_modules/file-2-changed.md",
        },
        markdownFiles: [
          {
            path: "workspace/file-1.md",
            content: "[link](node_modules/file-2.md)",
          },
          {
            path: "workspace/node_modules/file-2-changed.md",
            content: "# Just some markdow file",
          },
        ],
        workspacePath: "workspace/",
        // Exclude node_modules at top level
        exclude: ["node_modules/**"],
        expectedEdits: [],
      });
    });

    it("ignores markdown files in excluded directories", () => {
      testRename({
        payload: {
          pathBefore: "hello.txt",
          pathAfter: "hello-changed.txt",
        },
        markdownFiles: [
          {
            path: "ignored-1/file-1.md",
            content: "[](../hello.txt)",
          },
          {
            path: "ignored-2/file-2.md",
            content: "[](../hello.txt)",
          },
        ],
        exclude: ["**/ignored-1/**", "**/ignored-2/**"],
        expectedEdits: [],
      });
    });

    it("works when renaming folders", () => {
      testRename({
        payload: {
          pathBefore: "my/workspace/before",
          pathAfter: "my/workspace/after",
        },
        markdownFiles: [
          {
            path: "my/workspace/file-1.md",
            content: trimLines(`
              [link-1](before/1.txt)
              [link-2](before/2.txt)
              [link-3](before/sub/3.txt)
            `),
          },
        ],
        workspacePath: "my/workspace/",
        expectedEdits: [
          {
            path: "my/workspace/file-1.md",
            range: "0:0-0:22",
            newText: "[link-1](after/1.txt)",
            requiresPathToExist: "my/workspace/after/1.txt",
          },
          {
            path: "my/workspace/file-1.md",
            range: "1:0-1:22",
            newText: "[link-2](after/2.txt)",
            requiresPathToExist: "my/workspace/after/2.txt",
          },
          {
            path: "my/workspace/file-1.md",
            range: "2:0-2:26",
            newText: "[link-3](after/sub/3.txt)",
            requiresPathToExist: "my/workspace/after/sub/3.txt",
          },
        ],
      });
    });

    it("can handle folders with names that look like files", () => {
      testRename({
        payload: {
          pathBefore: "folder.txt",
          pathAfter: "folder-changed.txt",
        },
        markdownFiles: [
          {
            path: "file-1.md",
            content: "[hello](folder.txt/subfolder.txt/hello.txt)",
          },
        ],
        expectedEdits: [
          {
            path: "file-1.md",
            range: "0:0-0:43",
            newText: "[hello](folder-changed.txt/subfolder.txt/hello.txt)",
            requiresPathToExist: "folder-changed.txt/subfolder.txt/hello.txt",
          },
        ],
      });
    });

    it("does not include markdown files outside the include pattern", () => {
      testRename({
        payload: {
          pathBefore: "included/hello.txt",
          pathAfter: "included/hello-changed.txt",
        },
        markdownFiles: [
          {
            path: "not-included.md",
            content: "[](included/hello.txt)",
          },
          {
            path: "included/file.md",
            content: "[](hello.txt)",
          },
        ],
        expectedEdits: [
          {
            path: "included/file.md",
            range: "0:0-0:13",
            newText: "[](hello-changed.txt)",
          },
        ],
        include: ["**/included/**"],
      });
    });

    it("does not process the renamed file if it is outside the include pattern", () => {
      testRename({
        payload: {
          pathBefore: "not-included.txt",
          pathAfter: "not-included-changed.txt",
        },
        markdownFiles: [
          {
            path: "included/file.md",
            content: "[](../not-included.txt)",
          },
        ],
        expectedEdits: [],
        include: ["**/included/**"],
      });
    });

    it("can use multiple include patterns", () => {
      testRename({
        payload: {
          pathBefore: "included/hello.txt",
          pathAfter: "included/hello-changed.txt",
        },
        markdownFiles: [
          {
            path: "included/file.md",
            content: "[](hello.txt)",
          },
          {
            path: "included-file.md",
            content: "[](included/hello.txt)",
          },
        ],
        expectedEdits: [
          {
            path: "included/file.md",
            range: "0:0-0:13",
            newText: "[](hello-changed.txt)",
          },
          {
            path: "included-file.md",
            range: "0:0-0:22",
            newText: "[](included/hello-changed.txt)",
          },
        ],
        include: ["**/included/**", "included-file.md"],
      });
    });

    it("updates the renamed files own links with section reference", () => {
      testRename({
        payload: {
          pathBefore: "file-1.md",
          pathAfter: "folder/file-1.md",
        },
        markdownFiles: [
          {
            path: "folder/file-1.md",
            content: "[link to file-2](file-2.md#test)",
          },
          {
            path: "file-2.md",
            content: "# test",
          },
        ],
        expectedEdits: [
          {
            path: "folder/file-1.md",
            range: "0:0-0:32",
            newText: "[link to file-2](../file-2.md#test)",
            requiresPathToExist: "file-2.md",
          },
        ],
      });
    });
  });

  describe("save", () => {
    it.each`
      oldHeader        | oldLink       | newHeader         | newLink
      ${"old text"}    | ${"old-text"} | ${"the new txt"}  | ${"the-new-txt"}
      ${"halløjs's"}   | ${"halløjss"} | ${"dåv    dav"}   | ${"dåv-dav"}
      ${"emoji 👍 np"} | ${"emoji-np"} | ${"emoji 😃-yay"} | ${"emoji--yay"}
    `(
      "renames link when header changes from '$oldHeader' to '$newHeader'",
      ({ oldHeader, oldLink, newHeader, newLink }) => {
        const event: ChangeEvent<"save"> = {
          type: "save",
          payload: {
            path: "/files/foo.md",
            contentBefore: trimLines(`
              Link:
              [link](#${oldLink})

              ## ${oldHeader}
            `),
            contentAfter: trimLines(`
              Link:
              [link](#${oldLink})

              ## ${newHeader}
            `),
          },
        };

        const markdownFiles: FileList = [
          {
            path: event.payload.path,
            content: event.payload.contentAfter,
          },
        ];

        expect(
          pureGetEdits(event, markdownFiles, { workspacePath: "/" })[0]
        ).toEqual({
          path: event.payload.path,
          range: {
            start: {
              line: 1,
              character: 0,
            },
            end: {
              line: 1,
              character: `[link](#${oldLink})`.length,
            },
          },
          newText: `[link](#${newLink})`,
        });
      }
    );
  });
});
