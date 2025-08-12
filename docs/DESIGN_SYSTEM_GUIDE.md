# KRDS Design System MCP Tools Guide

This guide provides comprehensive documentation for the KRDS Design System MCP tools, which enable developers to extract, analyze, and utilize design patterns from the Korean government KRDS website.

## Overview

The KRDS Design System MCP tools provide a "Magic MCP"-like experience specifically tailored for Korean government websites. These tools extract UI/UX patterns, design tokens, and component structures from https://v04.krds.go.kr to help developers create government-compliant interfaces.

## Available Tools

### 1. `analyze-design-system`

Performs comprehensive design system analysis of the KRDS website.

**Purpose**: Extract and analyze the complete design system including colors, typography, spacing, components, and government standards.

**Parameters**:
```json
{
  "pages": ["https://v04.krds.go.kr/main.do"], // Optional: specific pages to analyze
  "includeAccessibility": true,                // Include accessibility analysis
  "includeGovernmentStandards": true          // Include government compliance standards
}
```

**Returns**:
- Design tokens (colors, spacing, typography)
- Component inventory with accessibility features
- Color schemes and typography scales
- Government standards compliance information
- Layout patterns used across the site

**Example Usage**:
```typescript
// Analyze the main KRDS pages
const analysis = await mcpClient.callTool('analyze-design-system', {
  pages: [
    'https://v04.krds.go.kr',
    'https://v04.krds.go.kr/main.do'
  ],
  includeAccessibility: true,
  includeGovernmentStandards: true
});
```

### 2. `extract-components`

Extracts specific UI component patterns from KRDS pages.

**Purpose**: Get detailed HTML, CSS, and accessibility information for specific component types.

**Parameters**:
```json
{
  "componentType": "header",        // header|navigation|form|table|card|button|modal|footer
  "selector": ".main-header",       // Optional: CSS selector for specific components
  "includeVariants": true          // Include component variations
}
```

**Returns**:
- Component HTML structure
- Associated CSS styles
- JavaScript interactions (if any)
- Accessibility features and ARIA labels
- Component variants and usage guidelines
- Design tokens used by the component

**Example Usage**:
```typescript
// Extract all header components
const headers = await mcpClient.callTool('extract-components', {
  componentType: 'header',
  includeVariants: true
});

// Extract specific navigation with custom selector
const navigation = await mcpClient.callTool('extract-components', {
  componentType: 'navigation',
  selector: '.global-nav',
  includeVariants: false
});
```

### 3. `get-design-tokens`

Retrieves design tokens and CSS variables from the KRDS system.

**Purpose**: Access the design tokens (colors, spacing, typography) used across KRDS for consistent styling.

**Parameters**:
```json
{
  "type": "color",           // Optional: color|spacing|typography|shadow|border|size
  "category": "primary",     // Optional: filter by token category
  "search": "blue"          // Optional: search tokens by name or value
}
```

**Returns**:
- Filtered design tokens
- Tokens grouped by type
- CSS custom properties
- Usage context for each token
- Summary statistics

**Example Usage**:
```typescript
// Get all color tokens
const colorTokens = await mcpClient.callTool('get-design-tokens', {
  type: 'color'
});

// Search for spacing tokens
const spacingTokens = await mcpClient.callTool('get-design-tokens', {
  type: 'spacing',
  search: 'margin'
});
```

### 4. `generate-code-snippet`

Generates reusable code snippets based on KRDS component patterns.

**Purpose**: Create ready-to-use code for specific components in various frameworks.

**Parameters**:
```json
{
  "componentType": "button",        // Component type to generate
  "variant": "primary",            // Optional: specific variant
  "framework": "react",            // html|react|vue|angular
  "includeAccessibility": true     // Include accessibility attributes
}
```

**Returns**:
- Framework-specific code (HTML, React JSX, Vue template, etc.)
- Associated CSS styles
- JavaScript functionality (if applicable)
- Usage instructions and examples
- Accessibility guidelines

**Example Usage**:
```typescript
// Generate React button component
const reactButton = await mcpClient.callTool('generate-code-snippet', {
  componentType: 'button',
  variant: 'primary',
  framework: 'react',
  includeAccessibility: true
});

// Generate HTML form component
const htmlForm = await mcpClient.callTool('generate-code-snippet', {
  componentType: 'form',
  framework: 'html'
});
```

### 5. `create-interface`

Creates complete interfaces based on KRDS design patterns.

**Purpose**: Generate full page layouts using KRDS components and patterns.

**Parameters**:
```json
{
  "layout": "dashboard",           // full-page|dashboard|form|list|detail
  "components": ["header", "navigation", "footer"], // Components to include
  "theme": "default",             // default|dark|high-contrast
  "accessibility": true,          // Include accessibility features
  "responsive": true             // Make interface responsive
}
```

**Returns**:
- Complete HTML interface
- Comprehensive CSS with design tokens
- JavaScript for interactions
- Documentation and usage guidelines
- Government compliance checklist

**Example Usage**:
```typescript
// Create a government dashboard
const dashboard = await mcpClient.callTool('create-interface', {
  layout: 'dashboard',
  components: ['header', 'navigation', 'table', 'footer'],
  theme: 'default',
  accessibility: true,
  responsive: true
});

// Create a government form page
const formPage = await mcpClient.callTool('create-interface', {
  layout: 'form',
  components: ['header', 'form', 'footer'],
  accessibility: true
});
```

### 6. `analyze-accessibility`

Analyzes accessibility features and compliance of KRDS design patterns.

**Purpose**: Evaluate WCAG compliance and accessibility features of KRDS components.

**Parameters**:
```json
{
  "url": "https://v04.krds.go.kr/main.do", // Optional: specific URL to analyze
  "includeWcagChecks": true,               // Include WCAG compliance analysis
  "includeColorContrast": true            // Include color contrast analysis
}
```

**Returns**:
- WCAG compliance assessment
- Color contrast analysis
- Keyboard navigation support
- Screen reader compatibility
- Accessibility improvement recommendations

**Example Usage**:
```typescript
// Analyze accessibility of main page
const accessibilityReport = await mcpClient.callTool('analyze-accessibility', {
  url: 'https://v04.krds.go.kr/main.do',
  includeWcagChecks: true,
  includeColorContrast: true
});
```

### 7. `export-design-system`

Exports the KRDS design system in various formats.

**Purpose**: Export design tokens and patterns for use in design tools and development workflows.

**Parameters**:
```json
{
  "format": "css",              // json|css|scss|figma-tokens
  "includeDocumentation": true, // Include usage documentation
  "minified": false            // Minify output
}
```

**Returns**:
- Design system in requested format
- Usage documentation
- Installation instructions
- File size and metadata

**Example Usage**:
```typescript
// Export as CSS variables
const cssExport = await mcpClient.callTool('export-design-system', {
  format: 'css',
  includeDocumentation: true,
  minified: false
});

// Export for Figma design tokens plugin
const figmaTokens = await mcpClient.callTool('export-design-system', {
  format: 'figma-tokens',
  includeDocumentation: false
});
```

## Government Standards Compliance

All extracted patterns and generated code comply with Korean government web standards:

### Accessibility Requirements
- **WCAG 2.1 AA compliance**: All components meet accessibility standards
- **Korean language support**: Proper handling of Hangul text and IME input
- **Screen reader compatibility**: Semantic HTML and ARIA labels
- **Keyboard navigation**: Full keyboard accessibility support

### Government Branding
- **Official color schemes**: Uses approved government color palettes
- **Typography standards**: Follows government typography guidelines  
- **Logo usage**: Proper placement and sizing of government logos
- **Layout requirements**: Adheres to mandated header/footer structures

### Technical Standards
- **Cross-browser compatibility**: Works across required government browsers
- **Mobile responsiveness**: Responsive design for mobile government services
- **Performance optimization**: Meets government performance requirements
- **Security considerations**: Follows government security guidelines

## Integration Examples

### Basic Design System Analysis
```typescript
// 1. Analyze the complete KRDS design system
const analysis = await mcpClient.callTool('analyze-design-system');

// 2. Extract specific components you need
const headers = await mcpClient.callTool('extract-components', {
  componentType: 'header'
});

// 3. Get design tokens for consistency
const tokens = await mcpClient.callTool('get-design-tokens');

// 4. Generate code for your framework
const reactComponents = await mcpClient.callTool('generate-code-snippet', {
  componentType: 'header',
  framework: 'react'
});
```

### Building a Government Website
```typescript
// Create a complete government interface
const website = await mcpClient.callTool('create-interface', {
  layout: 'full-page',
  components: ['header', 'navigation', 'table', 'form', 'footer'],
  accessibility: true,
  responsive: true
});

// Export design system for your team
const designSystem = await mcpClient.callTool('export-design-system', {
  format: 'scss',
  includeDocumentation: true
});

// Verify accessibility compliance
const accessibilityCheck = await mcpClient.callTool('analyze-accessibility', {
  includeWcagChecks: true,
  includeColorContrast: true
});
```

### Design Tool Integration
```typescript
// Export tokens for Figma
const figmaTokens = await mcpClient.callTool('export-design-system', {
  format: 'figma-tokens'
});

// Export CSS for development
const cssSystem = await mcpClient.callTool('export-design-system', {
  format: 'css',
  minified: false
});
```

## Best Practices

### 1. Government Compliance
- Always include accessibility features when generating components
- Use government-approved color schemes and typography
- Follow Korean web accessibility guidelines (KWAG)
- Include proper Korean language support

### 2. Development Workflow
- Start with `analyze-design-system` to understand available patterns
- Extract specific components you need with `extract-components`
- Generate framework-specific code with `generate-code-snippet`
- Validate accessibility with `analyze-accessibility`

### 3. Design Consistency
- Use `get-design-tokens` to maintain consistent spacing and colors
- Export design systems in appropriate formats for your tools
- Document component usage and guidelines
- Regularly verify compliance with government standards

### 4. Performance Considerations
- Use caching for repeated requests
- Request specific components rather than full analysis when possible
- Consider minified exports for production use
- Cache design tokens locally for development

## Troubleshooting

### Common Issues

**Components not found**: 
- Verify the KRDS website structure hasn't changed
- Try different component selectors
- Check if pages are accessible

**Accessibility warnings**:
- Review WCAG guidelines
- Test with screen readers
- Validate color contrast ratios
- Ensure keyboard navigation works

**Framework compatibility**:
- Verify framework-specific code generation
- Check for proper imports and dependencies
- Test responsive behavior
- Validate semantic HTML

### Support

For issues or questions about KRDS Design System MCP tools:
1. Check the component extraction logs for errors
2. Verify KRDS website accessibility  
3. Review government web standard updates
4. Test with actual Korean government requirements

## Conclusion

The KRDS Design System MCP tools provide a powerful way to extract, analyze, and utilize Korean government design patterns. By following these guidelines and using the tools appropriately, you can create government-compliant interfaces that meet Korean accessibility and branding standards.

Remember to always:
- Follow government accessibility requirements
- Use official design tokens and patterns
- Test with Korean language content
- Validate compliance before deployment
- Keep up with government standard updates