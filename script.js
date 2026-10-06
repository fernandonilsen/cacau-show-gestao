const SUPABASE_URL = 'https://orjgygmpxbggamwcbgfd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yamd5Z21weGJnZ2Ftd2NiZ2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNDU3NjAsImV4cCI6MjEwNjgyMTc2MH0.2NLW9fNp4Pp7MTg2GaYM-NdSMTtJq2TDS6MugtzzoGw';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Verificar autenticação e permissões nas páginas protegidas
async function verificarSessao() {
    const { data: { session } } = await _supabase.auth.getSession();
    const path = window.location.pathname;

    if (!session && !path.includes('login.html')) {
        window.location.href = 'login.html';
        return null;
    }

    if (session) {
        // Buscar o cargo (role) e nome do usuário na tabela profiles
        const { data: profile } = await _supabase
            .from('profiles')
            .select('role, nome')
            .eq('id', session.user.id)
            .single();

        if (path.includes('login.html')) {
            window.location.href = 'index.html';
            return;
        }

        // Restringir páginas de admin (produtos e usuários) apenas para administradores
        if ((path.includes('produtos.html') || path.includes('usuarios.html')) && profile?.role !== 'admin') {
            alert('Acesso restrito a administradores!');
            window.location.href = 'index.html';
            return;
        }

        return profile;
    }
}

// --- LÓGICA DE LOGIN ---
const formLogin = document.getElementById('form-login');
if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });

        if (error) {
            alert('Erro ao fazer login: ' + error.message);
        } else {
            window.location.href = 'index.html';
        }
    });
}

// --- BOTÃO DE LOGOUT (Adicionar dinamicamente no menu) ---
async function setupLayout() {
    const profile = await verificarSessao();
    const asideNav = document.querySelector('aside nav');
    
    if (asideNav && profile) {
        // Adicionar botão de Sair
        const btnLogout = document.createElement('a');
        btnLogout.href = '#';
        btnLogout.className = 'logout-btn';
        btnLogout.innerText = `🚪 Sair (${profile.nome || profile.role})`;
        btnLogout.onclick = async (e) => {
            e.preventDefault();
            await _supabase.auth.signOut();
            window.location.href = 'login.html';
        };
        asideNav.appendChild(btnLogout);
    }
}

// --- LÓGICA DE PRODUTOS ---
const formProduto = document.getElementById('form-produto');
if (formProduto) {
    setupLayout();
    formProduto.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('nome').value;
        const preco = parseFloat(document.getElementById('preco').value);
        const estoque = parseInt(document.getElementById('estoque').value);

        const editandoId = formProduto.dataset.editandoId;

        if (editandoId) {
            // Modo de Edição
            const { error } = await _supabase
                .from('produtos')
                .update({ nome, preco, estoque })
                .eq('id', editandoId);

            if (error) {
                alert('Erro ao atualizar produto: ' + error.message);
            } else {
                alert('Produto atualizado com sucesso!');
                formProduto.reset();
                delete formProduto.dataset.editandoId;
                const btnSubmit = formProduto.querySelector('button[type="submit"]');
                btnSubmit.innerText = 'Cadastrar Produto'; // Volta ao texto original
                carregarProdutosTabela();
            }
        } else {
            // Modo de Cadastro Novo
            const { error } = await _supabase.from('produtos').insert([{ nome, preco, estoque }]);
            
            if (error) {
                alert('Erro ao cadastrar produto: ' + error.message);
            } else {
                alert('Produto cadastrado com sucesso!');
                formProduto.reset();
                carregarProdutosTabela();
            }
        }
    });

    carregarProdutosTabela();
}

async function carregarProdutosTabela() {
    const tbody = document.getElementById('tabela-produtos');
    if (!tbody) return;

    const { data, error } = await _supabase.from('produtos').select('*').order('nome', { ascending: true });
    if (error) return console.error(error);

    tbody.innerHTML = '';
    data.forEach(prod => {
        tbody.innerHTML += `
            <tr>
                <td>${prod.nome}</td>
                <td>R$ ${Number(prod.preco).toFixed(2)}</td>
                <td>${prod.estoque}</td>
            </tr>
        `;
    });
}

// --- LÓGICA DE VENDAS ---
const formVenda = document.getElementById('form-venda');
if (formVenda) {
    setupLayout();
    carregarProdutosSelect();
    carregarHistoricoVendas();

    formVenda.addEventListener('submit', async (e) => {
        e.preventDefault();
        const produtoId = document.getElementById('produto-select').value;
        const quantidade = parseInt(document.getElementById('quantidade-venda').value);

        const { data: { session } } = await _supabase.auth.getSession();

        const { data: prodData, error: prodError } = await _supabase
            .from('produtos')
            .select('preco, estoque')
            .eq('id', produtoId)
            .single();

        if (prodError || !prodData) {
            alert('Erro ao buscar produto.');
            return;
        }

        if (prodData.estoque < quantidade) {
            alert('Estoque insuficiente!');
            return;
        }

        const valorTotal = prodData.preco * quantidade;

        const { error: vendaError } = await _supabase
            .from('vendas')
            .insert([{ 
                produto_id: produtoId, 
                quantidade, 
                valor_total: valorTotal,
                user_id: session.user.id 
            }]);

        if (vendaError) {
            alert('Erro ao registrar venda: ' + vendaError.message);
            return;
        }

        const novoEstoque = prodData.estoque - quantidade;
        await _supabase
            .from('produtos')
            .update({ estoque: novoEstoque })
            .eq('id', produtoId);

        alert('Venda registrada com sucesso!');
        formVenda.reset();
        carregarHistoricoVendas();
        carregarProdutosSelect();
    });
}

async function carregarProdutosSelect() {
    const select = document.getElementById('produto-select');
    if (!select) return;

    const { data, error } = await _supabase.from('produtos').select('id, nome, estoque').gt('estoque', 0);
    if (error) return console.error(error);

    select.innerHTML = '<option value="">Selecione um produto</option>';
    data.forEach(prod => {
        select.innerHTML += `<option value="${prod.id}">${prod.nome} (Estoque: ${prod.estoque})</option>`;
    });
}

async function carregarHistoricoVendas() {
    const tbody = document.getElementById('tabela-vendas');
    if (!tbody) return;

    const { data, error } = await _supabase
        .from('vendas')
        .select(`
            id,
            quantidade,
            valor_total,
            created_at,
            comprador,
            produtos (nome),
            profiles (nome)
        `)
        .order('created_at', { ascending: false });

    if (error) return console.error(error);

    tbody.innerHTML = '';
    data.forEach(venda => {
        const dataFormatada = new Date(venda.created_at).toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        tbody.innerHTML += `
            <tr>
                <td>${venda.produtos?.nome || 'Produto Removido'}</td>
                <td>${venda.comprador || 'Cliente Balcão'}</td>
                <td>${venda.quantidade}</td>
                <td>R$ ${Number(venda.valor_total).toFixed(2)}</td>
                <td>${dataFormatada}</td>
            </tr>
        `;
    });
}

async function cadastrarNovoUsuario(email, senha, nome, role) {
    const { data, error } = await _supabase.auth.signUp({
        email: email,
        password: senha,
        options: {
            data: { nome: nome } // Passa metadados se estiver usando a trigger
        }
    });

    if (error) {
        alert('Erro ao criar usuário: ' + error.message);
        return;
    }

    alert('Usuário criado com sucesso!');
}

// --- ATUALIZAÇÃO DA TABELA DE PRODUTOS (Com Botões de Ação) ---
async function carregarProdutosTabela() {
    const tbody = document.getElementById('tabela-produtos');
    if (!tbody) return;

    const { data, error } = await _supabase.from('produtos').select('*').order('nome', { ascending: true });
    if (error) return console.error(error);

    tbody.innerHTML = '';
    data.forEach(prod => {
        let alertaEstoque = prod.estoque <= 5 
            ? ` <span class="badge-alerta">Baixo</span>` 
            : '';

        tbody.innerHTML += `
            <tr>
                <td>${prod.nome}</td>
                <td>R$ ${Number(prod.preco).toFixed(2)}</td>
                <td class="${prod.estoque <= 5 ? 'estoque-baixo' : ''}">${prod.estoque} ${alertaEstoque}</td>
                <td style="text-align: center;">
                    <button class="btn-acao btn-editar" onclick="prepararEdicao(${prod.id}, '${prod.nome}', ${prod.preco}, ${prod.estoque})">✏️ Editar</button>
                    <button class="btn-acao btn-excluir" onclick="excluirProduto(${prod.id})">🗑️ Excluir</button>
                </td>
            </tr>
        `;
    });
}

// --- FUNÇÃO PARA EXCLUIR PRODUTO ---
async function excluirProduto(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    const { error } = await _supabase.from('produtos').delete().eq('id', id);

    if (error) {
        alert('Erro ao excluir produto. Verifique se ele possui vendas vinculadas.');
        console.error(error);
    } else {
        alert('Produto excluído com sucesso!');
        carregarProdutosTabela();
    }
}

// --- FUNÇÃO PARA PREPARAR EDIÇÃO ---
function prepararEdicao(id, nome, preco, estoque) {
    // Preenche o formulário de cadastro com os dados atuais
    document.getElementById('nome').value = nome;
    document.getElementById('preco').value = preco;
    document.getElementById('estoque').value = estoque;

    // Altera o formulário para modo de edição
    const form = document.getElementById('form-produto');
    const btnSubmit = form.querySelector('button[type="submit"]');
    
    btnSubmit.innerText = 'Atualizar Produto';
    form.dataset.editandoId = id; // Guarda o ID que está sendo editado
}

// --- LÓGICA DA PÁGINA DE RELATÓRIOS ---
const btnFiltrar = document.getElementById('btn-filtrar');
if (btnFiltrar) {
    setupLayout();
    carregarRelatorio(); // Carrega tudo por padrão
    carregarDashboardEOGraficos(); // <--- ADICIONE ESTA LINHA AQUI

    btnFiltrar.addEventListener('click', () => {
        carregarRelatorio();
        carregarDashboardEOGraficos(); // <--- E TAMBÉM AQUI (para atualizar ao filtrar, se quiser)
    });
}

async function carregarRelatorio() {
    const tbody = document.getElementById('tabela-relatorio');
    const faturamentoEl = document.getElementById('faturamento-total');
    const qtdVendasEl = document.getElementById('quantidade-vendas');
    if (!tbody) return;

    const dataInicio = document.getElementById('data-inicio').value;
    const dataFim = document.getElementById('data-fim').value;

    let query = _supabase
        .from('vendas')
        .select(`
            id,
            quantidade,
            valor_total,
            created_at,
            produtos (nome),
            profiles (nome)
        `)
        .order('created_at', { ascending: false });

    // Aplicar filtros de data se preenchidos
    if (dataInicio) {
        query = query.gte('created_at', `${dataInicio}T00:00:00`);
    }
    if (dataFim) {
        query = query.lte('created_at', `${dataFim}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) {
        console.error(error);
        return;
    }

    tbody.innerHTML = '';
    let faturamentoTotal = 0;
    let totalVendasCount = data.length;

    data.forEach(venda => {
        faturamentoTotal += Number(venda.valor_total);
        const dataFormatada = new Date(venda.created_at).toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        tbody.innerHTML += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${venda.produtos?.nome || 'Produto Removido'}</td>
                <td>${venda.quantidade}</td>
                <td>R$ ${Number(venda.valor_total).toFixed(2)}</td>
                <td>${venda.profiles?.nome || 'Vendedor'}</td>
            </tr>
        `;
    });

    faturamentoEl.innerText = `R$ ${faturamentoTotal.toFixed(2)}`;
    qtdVendasEl.innerText = totalVendasCount;
}

// --- LÓGICA DA PÁGINA DE USUÁRIOS ---
const formNovoUsuario = document.getElementById('form-novo-usuario');
if (formNovoUsuario) {
    setupLayout();
    carregarTabelaUsuarios();

    formNovoUsuario.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('novo-nome').value;
        const email = document.getElementById('novo-email').value;
        const senha = document.getElementById('novo-senha').value;
        const role = document.getElementById('novo-role').value;

        // Criar usuário utilizando o Supabase Auth
        const { data, error } = await _supabase.auth.signUp({
            email: email,
            password: senha,
            options: {
                data: { nome: nome, role: role } // Passa metadados para triggers ou uso posterior
            }
        });

        if (error) {
            alert('Erro ao cadastrar usuário: ' + error.message);
        } else {
            alert('Colaborador cadastrado com sucesso! (Certifique-se de que o perfil também foi criado na tabela profiles se necessário).');
            formNovoUsuario.reset();
            carregarTabelaUsuarios();
        }
    });
}

async function carregarTabelaUsuarios() {
    const tbody = document.getElementById('tabela-usuarios');
    if (!tbody) return;

    // Busca os dados da tabela profiles
    const { data, error } = await _supabase
        .from('profiles')
        .select('*')
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar usuários:', error);
        return;
    }

    tbody.innerHTML = '';
    data.forEach(user => {
        let badgeCargo = user.role === 'admin' 
            ? `<span class="badge-alerta" style="background-color: rgba(0, 179, 126, 0.2); color: #00b37e;">Admin</span>` 
            : `<span class="badge-alerta" style="background-color: rgba(142, 74, 35, 0.2); color: #8e4a23;">Vendedor</span>`;

        tbody.innerHTML += `
            <tr>
                <td>${user.nome || 'Não informado'}</td>
                <td>${user.email || 'Restrito'}</td>
                <td>${badgeCargo}</td>
            </tr>
        `;
    });
}

// --- LÓGICA DO PDV / CARRINHO DE COMPRAS ---
let carrinho = [];

const tabelaProdutosPdv = document.getElementById('tabela-produtos-pdv');
if (tabelaProdutosPdv) {
    setupLayout();
    carregarProdutosPDV();
    carregarHistoricoVendas();

    // Evento de busca rápida de produtos no PDV
    document.getElementById('busca-produto-pdv').addEventListener('input', (e) => {
        carregarProdutosPDV(e.target.value);
    });

    // Evento de finalizar venda
    document.getElementById('btn-finalizar-venda').addEventListener('click', async () => {
        if (carrinho.length === 0) return;

        const nomeComprador = document.getElementById('nome-comprador').value.trim() || 'Cliente Balcão';

        if (!confirm(`Deseja finalizar a venda para ${nomeComprador}?`)) return;

        const { data: { session } } = await _supabase.auth.getSession();
        if (!session) {
            alert('Sessão expirada. Faça login novamente.');
            window.location.href = 'login.html';
            return;
        }

        let erroOcorrido = false;

        for (const item of carrinho) {
            const { data: prodAtual, error: errBusca } = await _supabase
                .from('produtos')
                .select('estoque')
                .eq('id', item.id)
                .single();

            if (errBusca || prodAtual.estoque < item.quantidade) {
                alert(`Estoque insuficiente para o produto: ${item.nome}`);
                erroOcorrido = true;
                break;
            }

            // Registra a venda incluindo o comprador
            const { error: errVenda } = await _supabase.from('vendas').insert([{
                produto_id: item.id,
                quantidade: item.quantidade,
                valor_total: item.preco * item.quantidade,
                user_id: session.user.id,
                comprador: nomeComprador
            }]);

            if (errVenda) {
                alert(`Erro ao registrar venda de ${item.nome}: ` + errVenda.message);
                erroOcorrido = true;
                break;
            }

            const novoEstoque = prodAtual.estoque - item.quantidade;
            const { error: errEstoque } = await _supabase
                .from('produtos')
                .update({ estoque: novoEstoque })
                .eq('id', item.id);

            if (errEstoque) {
                alert(`Erro ao atualizar estoque de ${item.nome}`);
                erroOcorrido = true;
                break;
            }
        }

        if (!erroOcorrido) {
            alert('Venda finalizada com sucesso!');
            carrinho = [];
            document.getElementById('nome-comprador').value = '';
            atualizarCarrinhoUI();
            carregarProdutosPDV();
            carregarHistoricoVendas();
        }
    });
}

async function carregarProdutosPDV(filtro = '') {
    const tbody = document.getElementById('tabela-produtos-pdv');
    if (!tbody) return;

    let query = _supabase.from('produtos').select('*').gt('estoque', 0).order('nome', { ascending: true });
    
    const { data, error } = await query;
    if (error) return console.error(error);

    tbody.innerHTML = '';
    const produtosFiltrados = data.filter(p => p.nome.toLowerCase().includes(filtro.toLowerCase()));

    if (produtosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #7c7c8a;">Nenhum produto encontrado</td></tr>`;
        return;
    }

    produtosFiltrados.forEach(prod => {
        tbody.innerHTML += `
            <tr>
                <td>${prod.nome}</td>
                <td>R$ ${Number(prod.preco).toFixed(2)}</td>
                <td>${prod.estoque}</td>
                <td style="text-align: center;">
                    <button class="btn-acao" style="background-color: var(--accent); color: #121214; width: auto; padding: 0.3rem 0.6rem;" onclick="adicionarAoCarrinho(${prod.id}, '${prod.nome}', ${prod.preco}, ${prod.estoque})">➕ Adicionar</button>
                </td>
            </tr>
        `;
    });
}

function adicionarAoCarrinho(id, nome, preco, estoqueDisponivel) {
    const itemExistente = carrinho.find(item => item.id === id);

    if (itemExistente) {
        if (itemExistente.quantidade + 1 > estoqueDisponivel) {
            alert('Quantidade excede o estoque disponível!');
            return;
        }
        itemExistente.quantidade += 1;
    } else {
        carrinho.push({ id, nome, preco, quantidade: 1, estoque: estoqueDisponivel });
    }

    atualizarCarrinhoUI();
}

function removerDoCarrinho(id) {
    carrinho = carrinho.filter(item => item.id !== id);
    atualizarCarrinhoUI();
}

function alterarQtdCarrinho(id, delta) {
    const item = carrinho.find(i => i.id === id);
    if (!item) return;

    const novaQtd = item.quantidade + delta;
    if (novaQtd <= 0) {
        removerDoCarrinho(id);
        return;
    }
    if (novaQtd > item.estoque) {
        alert('Estoque insuficiente!');
        return;
    }

    item.quantidade = novaQtd;
    atualizarCarrinhoUI();
}

function atualizarCarrinhoUI() {
    const tbody = document.getElementById('tabela-carrinho');
    const totalEl = document.getElementById('carrinho-total');
    const btnFinalizar = document.getElementById('btn-finalizar-venda');
    if (!tbody) return;

    if (carrinho.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #7c7c8a;">Carrinho vazio</td></tr>`;
        totalEl.innerText = `R$ 0,00`;
        btnFinalizar.disabled = true;
        btnFinalizar.style.opacity = '0.5';
        return;
    }

    tbody.innerHTML = '';
    let totalGeral = 0;

    carrinho.forEach(item => {
        const subtotal = item.preco * item.quantidade;
        totalGeral += subtotal;

        tbody.innerHTML += `
            <tr>
                <td>${item.nome}</td>
                <td>
                    <button onclick="alterarQtdCarrinho(${item.id}, -1)" style="padding: 0.1rem 0.4rem; width: auto; margin-bottom:0;">-</button>
                    <span style="margin: 0 0.4rem;">${item.quantidade}</span>
                    <button onclick="alterarQtdCarrinho(${item.id}, 1)" style="padding: 0.1rem 0.4rem; width: auto; margin-bottom:0;">+</button>
                </td>
                <td>R$ ${subtotal.toFixed(2)}</td>
                <td style="text-align: center;">
                    <button onclick="removerDoCarrinho(${item.id})" style="background-color: var(--danger); padding: 0.2rem 0.5rem; width: auto; margin-bottom:0;">❌</button>
                </td>
            </tr>
        `;
    });

    totalEl.innerText = `R$ ${totalGeral.toFixed(2)}`;
    btnFinalizar.disabled = false;
    btnFinalizar.style.opacity = '1';
}