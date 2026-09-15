require("nvchad.configs.lspconfig").defaults()

-- Configure intelephense with hidden storage directory
vim.lsp.config("intelephense", {
  init_options = {
    globalStoragePath = os.getenv "HOME" .. "/.intelephense",
  },
})

local servers =
  { "ts_ls", "intelephense", "rust_analyzer", "tailwindcss", "pyright", "lua_ls", "biome", "html", "cssls" }
vim.lsp.enable(servers)

-- Add missing LSP keymaps (including code action)
vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(args)
    local bufnr = args.buf
    local map = vim.keymap.set
    local function opts(desc)
      return { buffer = bufnr, desc = "LSP " .. desc }
    end

    map("n", "<leader>ca", vim.lsp.buf.code_action, opts "Code action")
    map("n", "<leader>ci", vim.lsp.buf.implementation, opts "Go to implementation")
    map("n", "<leader>cr", vim.lsp.buf.references, opts "Show references")
    map("n", "<leader>ch", vim.lsp.buf.hover, opts "Hover documentation")
    map("n", "<leader>cs", vim.lsp.buf.signature_help, opts "Signature help")
  end,
})

-- read :h vim.lsp.config for changing options of lsp servers
