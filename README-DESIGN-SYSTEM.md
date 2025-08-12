# KRDS Design System MCP Server

## Overview

This MCP server now includes comprehensive design system extraction capabilities for the Korean government KRDS website (https://v04.krds.go.kr), similar to Magic MCP but specifically tailored for government-style interfaces and Korean web standards.

## New Design System Features

### 🎨 **7 New MCP Tools Added**

1. **`analyze-design-system`** - Comprehensive design system analysis
2. **`extract-components`** - Extract specific UI component patterns  
3. **`get-design-tokens`** - Retrieve design tokens and CSS variables
4. **`generate-code-snippet`** - Generate reusable code snippets
5. **`create-interface`** - Create complete interfaces based on KRDS patterns
6. **`analyze-accessibility`** - Analyze accessibility compliance
7. **`export-design-system`** - Export design system in various formats

### 🏗️ **Architecture**

```
src/
├── services/
│   └── design-system-service.ts     # Core design system extraction service
├── tools/
│   └── design-system.ts             # MCP tools for design system analysis
└── docs/
    └── DESIGN_SYSTEM_GUIDE.md       # Comprehensive usage guide
```

### 🚀 **Key Capabilities**

#### **UI/UX Pattern Extraction**
- Extracts headers, navigation, forms, tables, cards, buttons, modals, footers
- Captures HTML structure, CSS styles, and JavaScript interactions
- Identifies component variants and usage patterns
- Documents accessibility features and ARIA labels

#### **Design Token Analysis**
- Extracts CSS custom properties and variables
- Analyzes color schemes (primary, secondary, accent, neutral, semantic)
- Documents typography scales (fonts, sizes, weights, line heights)
- Maps spacing systems (margins, padding, gaps)
- Categorizes design tokens by type and usage

#### **Government Standards Compliance**
- **WCAG 2.1 AA compliance** checking
- **Korean web accessibility** guidelines validation
- **Government branding** standards verification
- **Official color palettes** and typography analysis
- **Layout requirements** compliance checking

#### **Multi-Framework Code Generation**
- **HTML/CSS** - Pure semantic markup
- **React** - JSX components with TypeScript
- **Vue** - Template components
- **Angular** - Component architecture
- Includes accessibility attributes and ARIA labels
- Framework-specific best practices

#### **Design System Export**
- **JSON** - Complete design system data
- **CSS** - CSS custom properties and component styles
- **SCSS** - Sass variables and mixins
- **Figma Tokens** - Design tokens plugin format
- Documentation and usage guidelines

### 🎯 **Use Cases**

#### **For Developers**
```typescript
// Analyze complete KRDS design system
const analysis = await mcpClient.callTool('analyze-design-system');

// Extract government header components
const headers = await mcpClient.callTool('extract-components', {
  componentType: 'header',
  includeVariants: true
});

// Generate React button component
const reactButton = await mcpClient.callTool('generate-code-snippet', {
  componentType: 'button',
  framework: 'react',
  includeAccessibility: true
});

// Create complete government interface
const interface = await mcpClient.callTool('create-interface', {
  layout: 'dashboard',
  components: ['header', 'navigation', 'table', 'footer'],
  accessibility: true
});
```

#### **For Designers**
```typescript
// Export design tokens for Figma
const figmaTokens = await mcpClient.callTool('export-design-system', {
  format: 'figma-tokens'
});

// Get color palette
const colors = await mcpClient.callTool('get-design-tokens', {
  type: 'color'
});

// Analyze accessibility compliance
const a11y = await mcpClient.callTool('analyze-accessibility', {
  includeWcagChecks: true,
  includeColorContrast: true
});
```

#### **For Government Agencies**
- Create consistent, accessible interfaces
- Follow Korean government web standards
- Maintain brand compliance across projects
- Ensure WCAG 2.1 AA accessibility compliance
- Use officially approved design patterns

### 🏛️ **Government Standards Support**

#### **Accessibility Requirements**
- ✅ **WCAG 2.1 AA** compliance verification
- ✅ **Korean language** IME and text support
- ✅ **Screen reader** semantic markup
- ✅ **Keyboard navigation** full support
- ✅ **Color contrast** ratio validation
- ✅ **Focus management** indicators

#### **Korean Government Branding**
- ✅ **Official color palettes** extraction
- ✅ **Typography standards** compliance
- ✅ **Logo placement** guidelines
- ✅ **Layout requirements** (headers/footers)
- ✅ **Responsive design** mobile-first approach

#### **Technical Standards**
- ✅ **Cross-browser** compatibility (IE11+)
- ✅ **Mobile responsive** government services
- ✅ **Performance optimized** loading
- ✅ **Security compliant** markup
- ✅ **SEO optimized** structure

### 📚 **Documentation**

Comprehensive documentation is available in:
- **`docs/DESIGN_SYSTEM_GUIDE.md`** - Complete usage guide with examples
- **Tool descriptions** - Built-in parameter documentation
- **Code examples** - Real-world implementation patterns
- **Government guidelines** - Compliance requirements

### 🔧 **Integration**

The design system tools integrate seamlessly with the existing KRDS MCP server:

```typescript
// Available alongside existing tools
const tools = [
  'krds_search',              // Search Korean government documents
  'krds_content_retrieval',   // Retrieve document content
  'krds_navigation',          // Navigate site structure
  'krds_image_tools',         // Process images and OCR
  'krds_export',              // Export in various formats
  'krds_korean_text',         // Korean text processing
  'krds_design_system',       // 🆕 Design system analysis
];
```

### 🌟 **Benefits**

#### **For Development Teams**
- **Faster development** with ready-to-use components
- **Consistent design** across government projects
- **Accessibility compliance** built-in
- **Framework flexibility** (React, Vue, Angular, HTML)
- **Government standards** automatically enforced

#### **For Government Agencies**
- **Brand consistency** across digital services
- **Accessibility compliance** guaranteed
- **Cost reduction** through reusable patterns
- **Faster deployment** of compliant interfaces
- **Standards compliance** verification

#### **For Citizens**
- **Consistent experience** across government sites
- **Better accessibility** for disabled users
- **Mobile-optimized** government services
- **Faster loading** optimized interfaces
- **Reliable interactions** tested patterns

### 🛠️ **Technical Implementation**

The design system service includes:

#### **Advanced Web Scraping**
- Puppeteer-based extraction of live KRDS pages
- CSS custom property and variable extraction
- DOM structure analysis and component identification
- Accessibility attribute detection (ARIA, roles, etc.)

#### **Intelligent Pattern Recognition**
- Component type classification (header, nav, form, etc.)
- Variant detection and categorization
- Design token inference and categorization
- Layout pattern identification

#### **Multi-Format Export**
- JSON structured data for programmatic use
- CSS/SCSS for direct stylesheet integration
- Figma tokens for design tool integration
- Framework-specific code generation

#### **Government Compliance Validation**
- WCAG 2.1 AA automated checking
- Korean web standards verification
- Government branding guidelines compliance
- Color contrast ratio validation

## Future Enhancements

Planned improvements include:
- **Real-time monitoring** of KRDS design changes
- **Component usage analytics** across government sites
- **Design system versioning** and change tracking
- **Custom theme generation** for different agencies
- **Integration with government CMS** platforms

## Getting Started

1. **Install dependencies**: `npm install`
2. **Review documentation**: Read `docs/DESIGN_SYSTEM_GUIDE.md`
3. **Test tools**: Use MCP client to call design system tools
4. **Create government interfaces**: Follow examples in the guide
5. **Ensure compliance**: Validate accessibility and standards

The KRDS Design System MCP server now provides everything needed to create government-compliant, accessible, and consistent Korean government web interfaces following official KRDS design patterns and standards.