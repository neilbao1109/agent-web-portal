import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Typography,
  Chip,
  Stack,
} from '@mui/material';
import {
  Code as CodeIcon,
  ShoppingCart as ShoppingCartIcon,
  Functions as FunctionsIcon,
  Lock as LockIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';

interface PortalInfo {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  icon: React.ReactNode;
  tools: string[];
  color: string;
}

const portals: PortalInfo[] = [
  {
    id: 'basic',
    name: 'Basic Portal',
    description: 'Simple greeting service demonstrating basic AWP functionality',
    endpoint: '/basic',
    icon: <CodeIcon sx={{ fontSize: 40 }} />,
    tools: ['greet'],
    color: '#667eea',
  },
  {
    id: 'ecommerce',
    name: 'E-commerce Portal',
    description: 'Shopping cart, product search, and checkout functionality',
    endpoint: '/ecommerce',
    icon: <ShoppingCartIcon sx={{ fontSize: 40 }} />,
    tools: ['search_products', 'manage_cart', 'checkout'],
    color: '#f50057',
  },
  {
    id: 'jsonata',
    name: 'JSONata Portal',
    description: 'Evaluate JSONata expressions against JSON input data',
    endpoint: '/jsonata',
    icon: <FunctionsIcon sx={{ fontSize: 40 }} />,
    tools: ['jsonata_eval'],
    color: '#ff9800',
  },
  {
    id: 'auth',
    name: 'Auth Portal',
    description: 'Secure portal requiring AWP authentication',
    endpoint: '/auth',
    icon: <LockIcon sx={{ fontSize: 40 }} />,
    tools: ['secure_greet'],
    color: '#4caf50',
  },
  {
    id: 'blob',
    name: 'Blob Portal',
    description: 'Handle binary data with file upload/download',
    endpoint: '/blob',
    icon: <StorageIcon sx={{ fontSize: 40 }} />,
    tools: ['process_document', 'simple_tool'],
    color: '#9c27b0',
  },
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight={600}>
        Welcome to AWP Examples
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Select a portal below to test its tools and functionality.
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {portals.map((portal) => (
          <Grid item xs={12} sm={6} md={4} key={portal.id}>
            <Card
              sx={{
                height: '100%',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                },
              }}
            >
              <CardActionArea
                onClick={() => navigate(`/portals/${portal.id}`)}
                sx={{ height: '100%' }}
              >
                <CardContent>
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: `${portal.color}15`,
                      color: portal.color,
                      mb: 2,
                    }}
                  >
                    {portal.icon}
                  </Box>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    {portal.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {portal.description}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {portal.tools.map((tool) => (
                      <Chip
                        key={tool}
                        label={tool}
                        size="small"
                        variant="outlined"
                        sx={{ borderColor: portal.color, color: portal.color }}
                      />
                    ))}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ mt: 4, p: 3, bgcolor: 'background.paper', borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>
          Quick Start
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Use curl to test the portals:
        </Typography>
        <Box
          component="pre"
          sx={{
            p: 2,
            bgcolor: '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: 1,
            overflow: 'auto',
            fontSize: 13,
          }}
        >
          {`# Initialize a portal
curl -X POST http://localhost:3456/basic \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

# List tools
curl -X POST http://localhost:3456/basic \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool
curl -X POST http://localhost:3456/basic \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"greet","arguments":{"name":"World"}}}'`}
        </Box>
      </Box>
    </Box>
  );
}
