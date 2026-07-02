# frozen_string_literal: true

# Fallback when Jekyll runs without an explicit generate_site.py step (e.g. legacy Pages).
# Skips if cases.json already exists from CI or a prior generate_site run.
Jekyll::Hooks.register :site, :pre_init do |site|
  root = File.expand_path(site.config["source"])
  script = File.join(root, "scripts", "generate_site.py")
  cases_json = File.join(root, "_data", "cases.json")
  next unless File.file?(script)
  next if File.file?(cases_json)

  unless system("command -v pdftotext >/dev/null")
    Jekyll.logger.warn "Pre-build:", "pdftotext missing; cannot run generate_site.py"
    next
  end

  Jekyll.logger.info "Pre-build:", "running #{script}"
  success = system("python3", script, chdir: root)
  abort("generate_site.py failed") unless success
end
